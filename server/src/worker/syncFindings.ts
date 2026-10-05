import { prisma } from "../lib/prisma.ts";
import type { ReviewResult } from "../review/core/models.ts";

export interface SyncFindingsInput {
  repositoryId: string;
  number: number;
  jobId: string;
  author?: string;
  result: ReviewResult;
}

// Brings the change's findings table in step with one run's result. A finding
// is resolved only when this run actually read its file (or the file left the
// change); a partial run that skipped the file for budget says nothing about it.
// Ignoring is the user's call, so no run undoes it.
export async function syncFindings({ repositoryId, number, jobId, author, result }: SyncFindingsInput): Promise<void> {
  if (result.status === "failed") return;
  const now = new Date();
  const reviewed = new Set(result.coverage.reviewedFiles);
  const changed = new Set(result.files.map((file) => file.path));
  // A run can report the same fingerprint twice (overlapping chunks); one row each.
  const reported = new Map(result.findings.map((finding) => [finding.fingerprint, finding]));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.finding.findMany({
      where: { repositoryId, number },
      select: { id: true, fingerprint: true, state: true, file: true },
    });
    const known = new Map(existing.map((row) => [row.fingerprint, row]));

    for (const finding of reported.values()) {
      const snapshot = {
        title: finding.title,
        file: finding.file,
        startLine: finding.startLine,
        severity: finding.severity,
        category: finding.category,
        kind: finding.kind,
        changeTitle: result.change.title,
        lastJobId: jobId,
        lastSeenAt: now,
        // Backfilled rows have no author; keep a known one if the forge stops saying.
        ...(author ? { author } : {}),
      };
      const row = known.get(finding.fingerprint);
      if (!row) {
        await tx.finding.create({ data: { repositoryId, number, fingerprint: finding.fingerprint, ...snapshot } });
      } else if (row.state === "resolved") {
        await tx.finding.update({ where: { id: row.id }, data: { ...snapshot, state: "open", resolvedAt: null } });
      } else {
        await tx.finding.update({ where: { id: row.id }, data: snapshot });
      }
    }

    const gone = existing
      .filter((row) => row.state === "open" && !reported.has(row.fingerprint))
      .filter((row) => reviewed.has(row.file) || !changed.has(row.file))
      .map((row) => row.id);
    if (gone.length) {
      await tx.finding.updateMany({ where: { id: { in: gone } }, data: { state: "resolved", resolvedAt: now } });
    }
  });
}

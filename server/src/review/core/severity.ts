import { z } from "zod";

export const SEVERITIES = ["critical", "major", "minor", "info"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

const RANK: Record<Severity, number> = { critical: 3, major: 2, minor: 1, info: 0 };

export function severityRank(severity: Severity): number {
  return RANK[severity];
}

export function atLeast(severity: Severity, floor: Severity): boolean {
  return RANK[severity] >= RANK[floor];
}

export const CATEGORIES = [
  "security",
  "bug",
  "performance",
  "logic",
  "reliability",
  "maintainability",
  "testing",
  "style",
  "docs",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

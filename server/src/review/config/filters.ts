import type { ChangeSet } from "../core/models.ts";
import type { Config } from "./schema.ts";

type Change = Pick<ChangeSet, "title" | "author" | "labels" | "baseRef" | "headRef">;

// Why an automatic review should not run for this change, or null. Titles and
// branches match on a substring (titles ignoring case, so "wip" catches
// "WIP:"); logins and labels must match exactly, labels case-sensitively as
// the forges treat them. `actor` is whoever opened or pushed, which can differ
// from the author.
export function skipFilterReason(triggers: Config["triggers"], change: Change, actor?: string | null): string | null {
  const title = change.title.toLowerCase();
  const phrase = triggers.ignoreTitles.find((p) => title.includes(p.toLowerCase()));
  if (phrase) return `The title contains "${phrase}"`;

  const people = [change.author, actor].filter((login): login is string => Boolean(login));
  const login = people.find((person) => triggers.skipAuthors.some((skip) => skip.toLowerCase() === person.toLowerCase()));
  if (login) return `Changes by ${login} are not reviewed automatically`;

  const label = (change.labels ?? []).find((name) => triggers.skipLabels.includes(name));
  if (label) return `The change has the label "${label}"`;

  const source = change.headRef && triggers.skipSourceBranches.find((part) => change.headRef!.includes(part));
  if (source) return `The source branch ${change.headRef} matches "${source}"`;

  const target = change.baseRef && triggers.skipTargetBranches.find((part) => change.baseRef!.includes(part));
  if (target) return `The target branch ${change.baseRef} matches "${target}"`;

  return null;
}

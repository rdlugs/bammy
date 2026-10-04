import type { Config } from "../config/schema.ts";
import type { Walkthrough } from "../core/models.ts";

export const BLAST_RADIUS_LABELS: Record<NonNullable<Walkthrough["blastRadius"]>, string> = {
  small: "Small blast radius",
  medium: "Medium blast radius",
  large: "Large blast radius",
};

// Indexed by the walkthrough's 1-5 effort estimate.
export const EFFORT_LABELS: Record<number, string> = {
  1: "1-5 Minutes",
  2: "5-10 Minutes",
  3: "10-20 Minutes",
  4: "20-40 Minutes",
  5: "40+ Minutes",
};

// The labels this review should carry, and the rest of each enabled family to
// take off, so a later run that changes its estimate replaces the old label.
// A family that is turned off is left alone: those labels may be the team's own.
export function labelChanges(walkthrough: Walkthrough, output: Config["output"]): { add: string[]; remove: string[] } {
  const add: string[] = [];
  const remove: string[] = [];
  const pick = (family: Record<string | number, string>, current: string | undefined) => {
    if (current) add.push(current);
    remove.push(...Object.values(family).filter((label) => label !== current));
  };
  if (output.blastRadiusLabel && walkthrough.blastRadius) {
    pick(BLAST_RADIUS_LABELS, BLAST_RADIUS_LABELS[walkthrough.blastRadius]);
  }
  if (output.effortLabel) pick(EFFORT_LABELS, EFFORT_LABELS[walkthrough.estimatedEffort]);
  return { add, remove };
}

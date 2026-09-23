/** Choice lists shared by more than one page. */
// The cycle is the project type (ADR 0014): chosen at creation, never changed,
// and it selects the sector classification.
export const INVESTMENT_CYCLE_CHOICES = [
  { value: "LLF1", label: "LLF1" },
  { value: "LLF2", label: "LLF2" },
  { value: "IsDB", label: "IsDB" },
];

/** Sector taxonomy of a project type: IsDB for the IsDB cycle, LLF otherwise. */
export function taxonomyForCycle(cycle) {
  return cycle === "IsDB" ? "isdb" : "llf";
}

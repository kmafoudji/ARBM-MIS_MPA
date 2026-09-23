/**
 * ProjectTypeFilter — LLF | IsDB, placed before the sector filter of every
 * view that spans projects (ADR 0014). The two types classify their projects
 * in independent sector taxonomies, so a view shows one type at a time and
 * its sector filter speaks that type's taxonomy.
 *
 * The choice is remembered in the browser, so moving between portfolio views
 * keeps the same type. LLF is the default.
 */
import { useState } from "react";

export const PROJECT_TYPES = [
  { value: "llf",  label: "LLF" },
  { value: "isdb", label: "IsDB" },
];

const STORAGE_KEY = "arbm_project_type";

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return PROJECT_TYPES.some((t) => t.value === v) ? v : "llf";
  } catch {
    return "llf";
  }
}

/** [type, setType]: the project type of the portfolio views, remembered. */
export function useProjectType() {
  const [type, setTypeState] = useState(readStored);
  function setType(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* private window: not remembered */ }
    setTypeState(value);
  }
  return [type, setType];
}

/** Does a project (list/detail payload, or a cycle string) belong to the type? */
export function projectIsOfType(projectOrCycle, type) {
  const cycle = typeof projectOrCycle === "string" || projectOrCycle == null
    ? projectOrCycle
    : projectOrCycle.investment_cycle;
  return (cycle === "IsDB" ? "isdb" : "llf") === type;
}

export default function ProjectTypeFilter({ value, onChange, label = "Type" }) {
  return (
    <>
      {label && <span className="exec-fl">{label}</span>}
      <div className="exec-seg" role="group" aria-label="Project type">
        {PROJECT_TYPES.map((t) => (
          <button key={t.value} type="button" className={value === t.value ? "on" : ""}
            aria-pressed={value === t.value} onClick={() => onChange(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

# 0003 — Development-only UI unlocks are driven by `VITE_DEV_UNLOCK_ALL`

## Context

The project detail page freezes several configuration tabs once a project
passes the approval gates, gates the Logframe tab on Theory of Change nodes,
and requires a second approver at lifecycle gates. Those rules encode real
policy, but none of them is enforced by the API while `RBAC_ENFORCED` is off,
and they make imported projects — most of which sit past the gates — impossible
to edit or walk through in a development environment.

## Decision

- Both switches in `frontend/src/pages/ProjectDetail.jsx` — `DEV_UNLOCK_ALL`
  (tab locks) and `DEV_SKIP_DUAL_APPROVAL` — read
  `import.meta.env.VITE_DEV_UNLOCK_ALL === "true"`.
- The committed default is **off**: `main` carries the real behaviour.
- A development machine turns it on in the untracked compose override
  (`frontend` service `environment`), never in a tracked file.

## Consequences

- The frontend container must be recreated for a change of the variable to
  take effect (Vite reads `VITE_*` at start-up).
- The policy questions the switch defers — whether the Logframe gate follows
  the data or the intended order of work — remain open decisions; the flag is
  a testing affordance, not an answer.

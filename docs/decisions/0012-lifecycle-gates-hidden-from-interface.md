# 0012 — Approval gates are hidden from the interface; the backend rules stay dormant

## Context

The lifecycle has the 16 + 2 stages of the September 2026 list (LS001–LS018,
migration `project.0026`). Three of them are approval gates in the backend
(`GATE_STAGES` in `backend/apps/project/models.py`): LS005 TRC clearance,
LS006 IC endorsed, LS010 BED Approved. What a gate means is written in
`transition_stage` (`backend/apps/project/services.py`):

| Rule | Applies when | Behind `RBAC_ENFORCED` |
|---|---|---|
| A second approver (`dual_authorized_by`) is required | the target **or the source** stage is a gate, or the move is a rollback | yes |
| The second approver is not the actor | whenever one is required | yes |
| The second approver holds a given role (`STAGE_DUAL_ACTORS`) | TRC and Appraisal: Hub OTL; IC and BED: LLFMU tier — checked only if an approver is given | yes |
| The actor holds a role allowed for the target stage (`STAGE_ACTORS`) | every transition | yes |
| A justification is required | rollbacks | yes |
| SDGs, WE category, risk rating, start and end dates are filled in | entering LS010 BED Approved | **no — always enforced** |

`RBAC_ENFORCED` is `False` (`backend/config/settings/base.py`), so of all
this only the BED prerequisites act. The interface nonetheless presented the
gates — coloured segments, "next gate" wording, an Approval Gate phase, a
second-approver field — as if they were in force, and the gate set itself is
in question under the new lifecycle.

## Decision

- The interface does not show approval gates. Removed: the gate colour and
  legend in the lifecycle bars (`ProjectDetail`, `ProjectList`), the "next
  gate" / "at gate" wording (replaced by the next stage and by the phase),
  the Approval Gate phase on the dashboard (TRC, IC and BED count as
  Pre-Approval), the gate-coloured badges, and the **second-approver field**
  of the stage-change form.
- The backend is unchanged: `GATE_STAGES`, `STAGE_ACTORS`,
  `STAGE_DUAL_ACTORS` and the rules above stay, dormant behind
  `RBAC_ENFORCED`. The BED prerequisites keep blocking the move to LS010.
- The development switch of [0003](0003-dev-unlock-env-flag.md) for the
  transition form now only relaxes the rollback justification
  (`DEV_SKIP_ROLLBACK_JUSTIFICATION`).

## Consequences

- **Turning `RBAC_ENFORCED` on breaks stage changes from the interface.**
  The backend would demand a second approver for every move into or out of
  TRC, IC or BED and for every rollback, and the form has no field to give
  one: those transitions would fail with a validation error the user cannot
  satisfy. The form must regain the field — or the gate rules must change —
  before the switch is turned on.
- The six tests that expect the gate and rollback rules to raise
  ([testing-and-ci.md](../testing-and-ci.md#known-failing-tests)) are
  unaffected: they test the backend, which did not change.
- Transitions already recorded with a second approver still show it in the
  history list ("co-approuvé par …").
- Workplan **gate milestones** (`is_gate` on milestones, the Gantt chart) are
  a different concept and are not affected.

## Open questions

To settle before the gates come back, in the interface or enforced:

1. **Which stages are gates** under the September 2026 lifecycle. Pipeline
   Taskforce Selection (LS003) is a committee decision like TRC and IC;
   Signature (LS011) records an external act rather than an internal
   approval.
2. **Entering versus leaving.** The backend also requires a second approver
   when the *source* stage is a gate, so IC endorsed → IsDB AWP and BED
   Approved → Signature need one. It looks like an implementation artefact:
   it doubles approvals, and the former form only looked at the target.
3. **Appraisal (LS009).** The SFD asks for Specialist + Hub OTL there, and
   `STAGE_DUAL_ACTORS` still lists it, but it is not in `GATE_STAGES`. Under
   the old order the requirement held by accident (Appraisal followed IC, a
   gate); under the new one it is entered from Preparations and is not
   required at all.
4. **Undefined approver roles.** The SFD names "Pipeline Manager",
   "Director" and "System Admin", which are not among the defined roles; the
   code falls back to the LLFMU tier, so any LLFMU user can co-approve BED.
5. **The BED risk prerequisite** is always satisfiable: `RISK_RATING_CHOICES`
   holds only "To be defined".
6. **The failing tests** (T-34) must be resolved before `RBAC_ENFORCED` is
   turned on.

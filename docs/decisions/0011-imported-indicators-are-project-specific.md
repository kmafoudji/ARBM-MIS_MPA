# 0011 — An indicator the import creates is project-specific and dies with its project

## Context

`07_indicators_logframe` is matched on `indicator_code` alone: exact,
case-sensitive, against `Indicator.code`, which is unique. A code the
catalogue already holds is left untouched — the catalogue is the LLFMU's
(POL-2.01) and a project file does not rewrite it. A code it does not hold is
created.

Every workbook so far numbers its indicators after the project
(`SLE1031-IND-01`), so the institutional catalogue accumulated 92 rows of
project numbering against 175 seeded ones. Two things followed.

The loader never wrote `indicator_type`, so those rows kept the model default,
`numeric` — which made "Numeric" mean "came from a project workbook" by
accident, and left the catalogue page describing its two populations on
different axes: the seeded rows carry a chain level in `indicator_type`
(`output`, `outcome`, `impact` — values outside the choice list) with
`chain_level` empty, the imported ones carried `numeric` with `chain_level`
correctly filled.

And nothing tied the indicator to its project. `LogframeRow.project` is
`CASCADE` while `LogframeRow.indicator` is `PROTECT`, so deleting a project
took its logframe rows and left its indicators in the catalogue with nothing
pointing at them. CIV1008 left eleven behind that way.

## Decision

- `INDICATOR_TYPE_CHOICES` gains `project_specific` ("Project-specific"), and
  it is the field's default. The import sets it on the indicators it
  **creates**; an indicator already in the catalogue keeps the type the LLFMU
  gave it.
- The catalogue page shows "Project-specific" as its own section, last, after
  the institutional ones.
- Deleting a project deletes the `project_specific` indicators that were on
  its logframe, unless another project still has one on its own — that one
  survives, because deleting it would take a live project's logframe row.
- The link used is `LogframeRow`, not a foreign key from `Indicator` to
  `Project`. It already exists, it is the only thing that made the two
  populations distinguishable, and it answers "is this still in use" in the
  same query.

## Consequences

- `indicator_type` now carries a third meaning: a measurement type for the
  four SFD values, a chain level for the seeded rows, a provenance for
  `project_specific`. The decision makes an existing inconsistency uniform
  and visible rather than introducing one; which side of the model changes is
  still pending.
- A project indicator cannot also declare itself "Percentage" or "Count".
  None does today.
- The cleanup hangs off physical deletion, in a `pre_delete`/`post_delete`
  pair on `Project` — the first project signals in the codebase. If project
  deletion becomes a soft delete (pending), the cleanup moves with it or the
  orphans come back.
- The eleven CIV1008 rows were deleted by hand on 10 September 2026, before
  this behaviour existed; the migration backfills the remaining 81 from
  `numeric`, which on this database holds exactly them.

# 0006 — Projects carry one flat set of SDGs; sectors keep a primary

## Context

A project used to carry a `primary_sdg` foreign key and a set of contributing
SDGs, mirroring the primary/contributing pair used for sectors. Nothing read
the primary SDG apart from the detail page, the create wizard and the
POL-1.10 gate to BED Approved; no list, filter, report or aggregation used it.
The distinction cost a validation rule (the primary may not repeat as a
contributing SDG), two form controls and an import column, for no consumer.

Sectors are different: the portfolio views, the project list, the admin and
the reports all group and filter on `primary_sector`.

## Decision

- A project has one set of SDGs, `Project.sdgs`, through `ProjectSdg`. There
  is no primary SDG.
- POL-1.10 reads "at least one SDG assigned" for the SDG prerequisite of
  BED Approved.
- Sectors keep `primary_sector` plus contributing sectors, with the rule that
  the primary does not repeat as contributing. The asymmetry is deliberate.
- The API exposes `sdg_ids` (write) and `sdgs_detail` (read). The AS-IS
  import reads one `sdgs` column; the legacy `primary_sdg` and
  `contributing_sdgs` columns are still accepted, merged into the set, and
  flagged with a warning.
- Migration `project.0021` folded every existing primary SDG into the set
  before dropping the column, so no assignment was lost.

## Consequences

- A future portfolio view by SDG (M11-SF-2) is a many-to-many fan-out: a
  project counts under each of its SDGs, not once under a primary.
- The reconciliation row M1-F015 ("Primary SDG, VAL006 checked at BED gate")
  now means the presence of at least one SDG.
- The SDG and sector branches of the classification serializer no longer
  share one shape; `set_project_sectors()` keeps a guard that
  `set_project_sdgs()` does not have.

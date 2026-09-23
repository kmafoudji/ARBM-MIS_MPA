# 0014 — Two independent sector taxonomies, LLF and IsDB; the project type picks one

## Context

The taxonomy of ADR 0007 (three pillars, eight sectors) was adopted as "the
LLF2 taxonomy". The LLF sector mapping of September 2026 shows it is the IsDB
2026–2030 classification. The Fund classifies its own work in three sectors
(Health, Agriculture & Food Security, Social Infrastructure), and the two do
not map one to one: Social Infrastructure splits into Water & Sanitation,
Energy and, partly, Digital Infrastructure. Education, Transport and Rural
Development have no LLF counterpart.

The same system has to hold IsDB projects, classified the IsDB way, next to
the Fund's LLF1 and LLF2 projects.

## Decision

- `Sector.taxonomy` is `llf` or `isdb`. The two taxonomies are independent:
  there is no mapping between them in the model.
  - **LLF** is flat: `LLF_HEALTH`, `LLF_AGRI`, `LLF_SOCINF`. An LLF sector
    has no parent and is never a pillar.
  - **IsDB** keeps ADR 0007: pillars (`INFRA`, `SOC`, `RES`) and eight
    sectors under them. A pillar belongs to the same taxonomy as its sectors.
- `Project.investment_cycle` is the **project type**: `LLF1`, `LLF2` or
  `IsDB`. It selects the taxonomy — IsDB for `IsDB`, LLF otherwise
  (`Project.taxonomy`).
- The type is **required at creation and never changes afterwards**, not even
  LLF1 ↔ LLF2. The API rejects any change with a 400, the admin shows it read
  only, and a project created with the wrong type is created again.
- A project's primary and contributing sectors belong to its taxonomy, on
  every write path: create, classification, basic identity and the AS-IS
  import. ADR 0007's rule (never a pillar) applies on top.
- The AS-IS import reads `investment_cycle` on `01_project`. It is required
  for a new project; for an existing one it may repeat the stored type and
  must not differ from it. `primary_sector` is resolved within the project's
  taxonomy, and a code from the other taxonomy is an error that lists the
  valid ones.

- An indicator carries both classifications. `Indicator.sector` is its IsDB
  sector, required and never a pillar. `Indicator.llf_sector` is its LLF
  sector, set only for the indicators the Fund uses. Some indicators are
  IsDB-only; none is LLF-only.
- The AS-IS import reads an optional `llf_sector` on `07_indicators_logframe`.
  A new indicator of an LLF project without one takes the project's primary
  sector.
- Every view that spans projects shows **one type at a time**: executive
  dashboard, project list and map, portfolio results, fund performance, data
  quality, and the indicator catalogue. Their filter bar starts with LLF |
  IsDB, LLF by default, and their sector filter offers that type's taxonomy.
  The API takes `?type=llf|isdb` (`?taxonomy=` on the indicator list, where
  `type` already means the indicator type). There is no global setting.

## Consequences

- The LLF1 and LLF2 projects that used the IsDB sectors `AGRICU` and `HEALTH`
  moved to `LLF_AGRI` and `LLF_HEALTH` in migration
  `project.0027_isdb_cycle_llf_sectors`. Any other IsDB sector on an LLF
  project would have stopped the migration.
- AS-IS workbooks written before this decision need the `investment_cycle`
  column and LLF sector codes before a new project loads from them.
- `Indicator.sector` stays an IsDB sector; `seed_indicators` resolves its
  sector among IsDB sectors only, since the LLF ones share names with them.
- The pillar of a project (`pillar_id`, `pillar_name`) is empty for LLF
  projects.
- Nothing converts between the taxonomies, so no view mixes LLF and IsDB
  projects.
- The 562 indicators in the catalogue on 23 September 2026 were all in
  `AGRICU` or `HEALTH`, which map one to one. Migration
  `results.0016_indicator_llf_sector` gave them `LLF_AGRI` or `LLF_HEALTH`
  once. Indicators created later get their LLF sector by hand. The mapping
  slide counts 97 LLF indicators; which of the 562 really belong to the Fund,
  and the Social Infrastructure ones, is still to be settled.
- The executive dashboard has no pillars under LLF: its results block groups
  by sector there (`group_level`), and by pillar under IsDB.

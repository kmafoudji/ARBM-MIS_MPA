# Decisions

Architecture and process decisions that are in force, one file each, numbered
in the order they were recorded. Each states the context, the decision and its
consequences in the present tense; the history behind them is not kept here.

| # | Decision |
|---|---|
| [0001](0001-single-repository-main-is-deployed.md) | A single repository; `main` is the deployed branch |
| [0002](0002-merge-commits-no-pull-requests.md) | Merge commits, no required pull requests, no branch protection |
| [0003](0003-dev-unlock-env-flag.md) | Development-only UI unlocks are driven by `VITE_DEV_UNLOCK_ALL` |
| [0004](0004-language-new-code-english.md) | New code is English; existing French files stay French per file |
| [0005](0005-migrations-must-apply-from-scratch.md) | Migrations must apply from an empty database, and CI proves it |
| [0006](0006-flat-sdg-set-sectors-keep-a-primary.md) | Projects carry one flat set of SDGs; sectors keep a primary |
| [0007](0007-sector-taxonomy-pillar-then-sector.md) | The sector taxonomy has two levels: a project sits in a sector, under a pillar |
| [0008](0008-type-hierarchy-follows-poc-mockups.md) | Typographic hierarchy follows the POC mockups, not the LLF template's Light titles |
| [0009](0009-basemap-served-from-postgis-via-martin.md) | The basemap is Natural Earth in PostGIS, served by Martin from an explicit source list |
| [0010](0010-toc-sheet-loaded-when-complete.md) | The import loads a Theory of Change only when the tree is complete; fan-in becomes cross-pathways |
| [0011](0011-imported-indicators-are-project-specific.md) | An indicator the import creates is project-specific and dies with its project |
| [0012](0012-lifecycle-gates-hidden-from-interface.md) | Approval gates are hidden from the interface; the backend rules stay dormant |

## Pending

Questions with no decision yet. Each becomes a numbered file when decided.

- `Indicator.indicator_type` holds chain levels for the seeded rows and a
  provenance since 0011, not only types — which side of the model changes.
- How much of the data-dictionary correction (v1.2) reaches the Django models,
  and in what order.
- The portfolio country list exists in a fixture, in a constant and in GADM —
  which is the single source.
- Whether and how the French backend is translated (`help_text` generates
  migrations; three tiers by risk).
- The Logframe tab is gated on Theory of Change nodes rather than on logframe
  rows (0010 unblocks it for workbooks with a complete tree, not for the two
  legacy PADs); what suspended projects show.
- Project deletion is physical and open to every writer — soft delete and the
  role allowed to delete.
- Which lifecycle stages are approval gates under the September 2026 list,
  whether a gate binds entering or also leaving, and who co-approves — the
  open questions of 0012.
- Frontend routing on Azure Container Apps; the production images.
- The remaining ARBM-MES → ARBM-MIS rename in identifiers and cloud resources.

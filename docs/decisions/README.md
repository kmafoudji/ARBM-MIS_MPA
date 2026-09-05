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

## Pending

Questions with no decision yet. Each becomes a numbered file when decided.

- `Indicator.indicator_type` holds chain levels, not types — which side of the
  model changes.
- How much of the data-dictionary correction (v1.2) reaches the Django models,
  and in what order.
- The portfolio country list exists in a fixture, in a constant and in GADM —
  which is the single source.
- Whether and how the French backend is translated (`help_text` generates
  migrations; three tiers by risk).
- The Logframe tab is gated on Theory of Change nodes rather than on logframe
  rows; what suspended projects show.
- Project deletion is physical and open to every writer — soft delete and the
  role allowed to delete.
- The sector taxonomy: is the LLF2 numbering in the maintained database the
  adopted taxonomy (then the seed follows) or a draft.
- Frontend routing on Azure Container Apps; the production images.
- The remaining ARBM-MES → ARBM-MIS rename in identifiers and cloud resources.

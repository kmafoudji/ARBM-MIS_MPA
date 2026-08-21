# Design — AS-IS bulk import (in-app loader)

**aRBM-MIS · 21 Aug 2026 · design spec for `feature/asis-bulk-import`**

On the server this file belongs at `docs/superpowers/specs/2026-08-21-asis-bulk-import-design.md` and should be the first commit on the feature branch.

---

## 1. Goal

Let a user upload an AS-IS workbook through the interface, see exactly what will change, and confirm. Today there is no import capability at all: no endpoint, no spreadsheet library, only fixed seed commands. The immediate driver is loading `SLE1013_ASIS_load_v0_2.xlsx` and `NGA1007_ASIS_load_v0_2.xlsx`; the lasting value is that vocabulary validation moves into the repository instead of living in a spreadsheet.

## 2. Scope

**In:** the 13-sheet AS-IS workbook shape · validate-then-confirm · create a project or update an existing one · a change report shown before writing.

**Out (deliberate):** the full T01–T15 pack (six of its tables have no destination) · Celery (the file loads in seconds) · an `ImportBatch` record · partial acceptance · row-level deletion of anything absent from the file.

## 3. Decisions taken, with rationale

| # | Decision | Why |
|---|---|---|
| D-1 | Accept only the AS-IS 13-sheet shape | Smallest thing that works end to end. The wider pack waits until the six missing tables exist |
| D-2 | Two steps: validate → review → confirm, atomic | The database is shared and mistakes are real. All-or-nothing avoids half-loaded projects, which are hard to repair in a relational tree |
| D-3 | Stateless: the client re-sends the file on confirm | No model, no migration, no storage. Cheapest thing that works |
| D-4 | Guard D-3 with a hash echo | Validation returns `file_sha256`; confirm must send it back and the server recomputes it. Closes "validate file A, confirm file B" at zero cost |
| D-5 | Existing projects are updated, not refused | The file is the authoritative source; PAD and AWPB revisions must be able to land |
| D-6 | The file wins on conflict, with a diff shown first | Predictable. Overwriting a UI edit becomes visible and deliberate rather than silent |
| D-7 | Never delete rows present in the tool but absent from the file | Deleting an activity cascades to its delay logs, alerts and SPI snapshots; deleting a logframe row cascades to loaded actuals. Report the drift instead |
| D-8 | Replace-all for financing sources and milestones, **scoped to the project being loaded** | Neither has a stable identifier (see §7). Verified safe: no model references `FinancingSource` or `Milestone`, so replacement leaves no orphans. Rows belonging to other projects are never touched |

## 4. Architecture

Code lives in `backend/core/asis_import/` — `core/` is already where cross-cutting endpoints live (`health`, `csrf_bootstrap`, `LogoUploadView`), registered directly in `config/urls.py`. The importer writes across `project`, `results` and `workplan`, so it belongs to none of them.

```
backend/core/asis_import/
  __init__.py
  parser.py     # xlsx -> ImportPlan. Reads the database only to resolve
                # references; never writes. Pure and testable alone.
  plan.py       # ImportPlan / PlannedChange / ImportError dataclasses
  applier.py    # ImportPlan -> database, inside transaction.atomic().
                # Does not re-validate; trusts the plan.
  views.py      # the single endpoint
```

The boundary that matters: **`parser.py` decides everything, `applier.py` only writes.** Both endpoint modes run the same parse; the only difference is whether `apply` is called afterwards. A validation report can therefore never disagree with what a confirm would do.

`openpyxl` is added to `backend/requirements.txt`.

## 5. Endpoint

`POST /api/import/asis/` — multipart, registered in `config/urls.py` beside the logo upload.

| Field | Meaning |
|---|---|
| `file` | the workbook |
| `mode` | `validate` or `commit` |
| `expected_sha256` | required when `mode=commit` |

Responses:

- **200** (validate) — `{project_ref, project_exists, summary, changes[], errors[], warnings[], file_sha256}`
- **200** (commit) — same report plus `{committed: true, project_id}`
- **409** — `expected_sha256` does not match the uploaded file; nothing written
- **422** — the plan has errors; nothing written. Same report shape

Permission: `IsAuthenticated` + `HasModulePermission` on `m1_config_access`, matching the existing upload views so behaviour is right when RBAC is switched on.

## 6. The report

`changes[]` is a flat list, each entry `{sheet, action, target, detail}` where `action` is `create`, `update`, `replace` or `unchanged`. An `update` carries the field-level diff (`field, from, to`). Drift found under D-7 is reported as a `warning`, never an error.

`summary` counts by sheet and action, so the screen can lead with one line per sheet before the detail.

## 7. Sheet mapping

Every sheet has a note in row 1, headers in row 2, data from row 3. `00_README`, `98_Loader_Notes`, `99_Parked` and `99b_toc_nodes_parked` are ignored.

| Sheet | Target | Match strategy |
|---|---|---|
| `01_project` | `Project` + `project_country` / `project_sdg` / `project_sector` | `official_reference_number` |
| `02a_envelope` | `ProjectFinancialEnvelope` | one-to-one; create if absent |
| `02_financing_source` | `FinancingSource` | **replace-all** (D-8) |
| `03_donors` | `Donor` | create-or-match on `code` — **create if absent, never update an existing row**. These are global reference tables, not project data; a project file must not silently rewrite them |
| `04_agencies` | `ImplementingAgency` | create-or-match on `code`, same rule |
| `05_project_partners` | `ProjectImplementingPartner` | `(project, agency)` |
| `07_indicators_logframe` | `Indicator` + `LogframeRow` + a `LogframeTarget` for the end target | indicator by `code`; row by `(project, indicator)` |
| `08_logframe_targets` | `LogframeTarget` | `(logframe_row, target_date)` — the same key the end target from `07` uses, so a target appearing in both sheets updates one row instead of creating two |
| `09_components` | `WorkplanComponent` / `WorkplanSubComponent` | `(project, code)` / `(component, code)` |
| `10_activities` | `Activity` | `(sub_component, code)` |
| `11_milestones` | `Milestone` | **replace-all** (D-8) |
| `12_gadm_scope` | `ProjectGadmScope` | `(project, area)` |
| `13_results_data` | `ResultsData` | `(logframe_row, reporting_period)` |

**Why those two are replace-all.** `FinancingSource` has no natural key: SLE1013 carries two rows that are both `co_financing` + `loan` (ISFD and BADEA), distinguishable only by their note. `Milestone` has no code column at all, so the workbook's `SLE1013-M02` has nowhere to land. Adding identifier columns to both models is the better long-term fix and is listed in §12.

**Reporting periods.** After the project is created or its dates change, call `generate_reporting_periods`. It needs `reporting_frequency`, `next_reporting_due` and `end_date`, all of which `01_project` now supplies, and it generates no period beyond `end_date`. `13_results_data` ships empty in both current files, so this path is specified but barely exercised: match the period by label, and if none exists, raise an error naming the period rather than inventing one.

## 8. Validation

Errors (block the commit), each carrying sheet and row:

- enum values that are not model literals — `lifecycle_stage`, `fragility_status`, `geographic_typology`, `rio_marker_*`, financing `source` / `instrument`, activity `status`, milestone `status`, indicator `direction`, `chain_level`, `reporting_frequency`
- reference rows that do not exist — hub code, country ISO3, sector key, GADM area
- unresolved internal references — an activity naming a sub-component absent from `09_components`, a logframe row naming an indicator absent from `07`
- financing rows that do not reconcile to `budget_amount` (VAL015)
- required fields missing — `official_reference_number`, project name, `indicator.sector`
- dates that are malformed, or `end_date` before `start_date` (VAL012)

Warnings (reported, do not block): drift under D-7 · indicator definitions left empty · targets or milestones dated beyond `end_date` (legitimate; see the SLE PAD) · GADM coverage gaps.

## 9. Write order

Project → envelope → financing → donors and agencies → partners → indicators and logframe → components → sub-components → activities → milestones → GADM scope → reporting periods → results data. The whole sequence runs inside one `transaction.atomic()`.

## 10. Frontend

`frontend/src/pages/BulkImport.jsx`, imported in `App.jsx` with its own `nav` value and an `AppShell` entry — the pattern the other fourteen pages already follow (this app switches pages with `useState`, not a router).

Screen: file picker → per-sheet summary table → expandable detail → **Confirm**, disabled while any error exists. After a commit, a link to the project.

`api.js` needs a `apiFetchMultipart` variant: same CSRF handling, but it must **not** set `Content-Type` — the browser has to supply the multipart boundary itself.

## 11. Security

Follow `core/uploads.py`, which already reasons this through:

- check the leading bytes (`PK\x03\x04` — an xlsx is a ZIP) rather than trusting the declared `Content-Type`
- cap the size at 5 MB; the real files are ~35 KB
- open with `openpyxl` in `read_only=True, data_only=True` — formulas are never evaluated and external links are never followed
- the file is parsed in memory and never persisted

## 12. Testing and verification

Write tests under `backend/tests/` following the existing `factories.py` pattern, covering: parser enum rejection, unresolved internal reference, financing reconciliation, upsert producing an accurate diff, and the hash mismatch returning 409.

**They cannot be run yet.** The suite is blocked by the duplicated `results.0005` migration, so `pytest-django` cannot build its test database. Write them anyway — they become live the day that fix lands. Until then, verification is:

1. `mode=validate` against both v0.2 workbooks; read the report
2. commit NGA1007 first — no pending sign-off, everything `not_started`, smaller blast radius
3. inspect in `/admin/`: project, envelope totalling 95,000,000, 19 logframe rows, 25 activities
4. re-run validate on the same file — the report must show `unchanged` throughout, which is the real proof that upsert works
5. then SLE1013, expecting an envelope of 34,126,000 and 15 logframe rows

Do not claim the suite passed. State which of the five steps were performed.

## 13. Follow-ups this deliberately leaves open

- `ImportBatch` with file hash and status — would close M1-F082 / F083 / F084, currently absent
- identifier columns on `Milestone` and `FinancingSource`, removing the need for D-8
- the T01–T15 pack, once `activity_budget`, `deliverable`, `site`, `procurement_package`, `contract` and `risk` exist
- the ToC sheet, blocked on the level-adjacency decision
- catalogue policy: every indicator in these files is project-custom, so each load creates new entries in the LLFMU-governed catalogue rather than reusing `A001.x` equivalents

# Implementation plan — AS-IS bulk import

**Branch `feature/asis-bulk-import` · worktree `.claude/worktrees/asis-bulk-import` · 21 Aug 2026**

Implements `docs/superpowers/specs/2026-08-21-asis-bulk-import-design.md`. Read the spec
first; this plan only records *how* it gets built, what the two workbooks actually
contain, and where the spec meets reality and has to bend.

---

## 0. What the code will touch

Tracked files, all of them new except four:

| File | New? |
|---|---|
| `backend/core/asis_import/{__init__,plan,parser,applier,vocab,views}.py` | new |
| `backend/tests/test_asis_import.py` | new |
| `backend/requirements.txt` | **modified** — adds `openpyxl` |
| `backend/config/urls.py` | **modified** — one route |
| `frontend/src/pages/BulkImport.jsx` | new |
| `frontend/src/App.jsx` | **modified** — import + one `nav` branch |
| `frontend/src/components/AppShell.jsx` | **modified** — nav entry + breadcrumb |
| `frontend/src/i18n/{en,fr}.json` | **modified** — nav + page strings |
| `docs/superpowers/plans/…` (this file), `docs/superpowers/specs/…` (committed) | new |

**Deployment impact:** `openpyxl` is not in the running backend image (verified —
`ModuleNotFoundError`). Merging this requires a backend image rebuild, or the endpoint
500s on first use. Nothing else in the stack changes. No migration: the feature adds no
model (D-3).

---

## 1. What the workbooks actually contain

Verified by parsing both files directly (17 sheets each, 13 loaded, 4 ignored).

| | NGA1007 | SLE1013 |
|---|---|---|
| logframe rows (`07`) | 19 | 15 |
| activities (`10`) | 25 | 19 |
| components / sub-components (`09`) | 3 / 6 | 4 / 18 |
| financing rows (`02`) | 5, sums to 95,000,000 | 6, sums to 34,126,000 |
| donors / agencies | 2 / 5 | 4 / 6 |
| GADM scope rows (`12`) | 6 (1×ADM1, 5×ADM2) | 6, **all ADM3** |
| milestones (`11`) | 0 | 6, **all with blank `activity_id`** |
| targets (`08`) / results (`13`) | empty | empty |

The counts match the spec's §12 expectations (19/25 for NGA, 15 for SLE), so the sheet
mapping in §7 is sound. Four things it does not anticipate:

**(a) Row 1 is not always a note.** The spec says "a note in row 1, headers in row 2, data
from row 3". True for 9 sheets; `02a_envelope`, `03_donors` and `04_agencies` start with
the header in row 1. The parser locates the header row by looking for the expected column
names in rows 1–2 rather than assuming a fixed offset.

**(b) The reference tables are already populated, with different codes.** The database
holds donors `isdb`, `isfd` (lowercase); the workbooks say `ISDB`, `ISFD`. A literal
create-or-match on `code` would create duplicates of rows that already exist. Matching is
therefore case-insensitive. Agencies genuinely differ (`NGA-KNARDA` in the file vs
`knarda` in the database) and will be created as new rows — reported as a warning naming
the near-duplicate, so the operator sees it before confirming.

**(c) NGA1007 already exists in the shared database** — `id=2`, code `NGA-0001`, a stub
with a name, a lead country, two contributing SDGs and nothing else. So the spec's
"commit NGA1007 first, smaller blast radius" is an **update**, not a create, and it will
overwrite `name`, `acronym`, `lifecycle_stage` (`pipeline_taskforce_approved` →
`implementing`) and `geographic_typology` (`rural` → `mixed_multi_district`). That is D-5
and D-6 working as designed, but it is a live row and the diff must be read before
confirming, not after.

**(d) Blank cells are deliberate.** `01_project` for NGA leaves gender marker, Rio
markers, modality, fragility and risk empty, and its own row-1 note says so
("Classification blanks deliberate (OI-8)"). The existing NGA1007 row has
`risk_rating=moderate`. **A blank cell means "not supplied" and leaves the stored value
alone; it never clears a field.** Only a cell with a value can overwrite. This is an
extension of D-6 the spec does not state, and without it the first commit silently wipes
existing classification.

Dates are real date-formatted cells (`yyyy-mm-dd`), so `openpyxl` returns `datetime`; the
coercion helper still accepts ISO strings and bare Excel serials so a hand-edited file
does not fail obscurely.

---

## 2. Two decisions the spec cannot settle on its own

Both were put to the developer on 21 Aug 2026 and both recommendations were accepted.
They are settled; the wording below keeps the reasoning that led to them.

### D-9 · GADM rows that resolve to nothing — *decided: warning, row skipped*

Spec §8 lists "GADM area" under **errors**; §8's warning list has "GADM coverage gaps" and
the workbooks' own LN-7 says "Incomplete GADM coverage: warn, don't fail". Against the
actual database these readings diverge sharply:

- NGA: 5 of 6 rows resolve. `Danbatta` is spelled `Dambatta` in GADM → 1 row fails.
- SLE: **0 of 6 rows resolve.** Every row is ADM3 (chiefdoms: Torma Bum, Samu, Mambolo,
  Maforki, Lokomasama, Kamasondo); `GadmArea` holds only levels 1 and 2 for Sierra Leone
  (18 rows total), and the `admin1_name` "North West" is a post-2017 province that does
  not exist in the loaded GADM vintage either.

As an error, SLE1013 can never be committed. **Recommendation: unresolved GADM row →
warning, row skipped, everything else loads.** It matches LN-7, it matches D-7's "report
the drift instead", and geographic scope is inherited by M5 later rather than depended on
now. The alternative — error — makes the feature unable to load one of the two files it
was built for.

### D-10 · The six SLE milestones have no activity — *decided: placeholder activity*

`Milestone.activity` is a required FK and `Milestone.category` is a required choice; the
sheet supplies neither. LN-4 says blank-activity rows "attach to a placeholder per
WorkingDoc §4" — a document not in this repository.

Options: (i) create one placeholder activity per project to carry them, (ii) skip them
with a warning, (iii) refuse the file. **Recommendation: (i)** — a single activity coded
`<REF>-A-MILESTONES`, named "Project milestones (placeholder)", hung off the last
sub-component, dated `start_date`→`end_date`, `status=not_started`, created only when the
file actually has activity-less milestones and reported in the change list as an explicit
`create` so it is never a surprise. Category defaults to `contractual` (the six are
signature, effectiveness, disbursements, completion report) with a per-row warning naming
the assumption.

Both were confirmed before any code was written.

---

## 3. Vocabulary mapping (`vocab.py`)

Judgment calls, confirmed with the developer on 21 Aug 2026, each one reported as a
warning on the row it fires on so nothing is silent:

| Sheet column | File value | Model literal |
|---|---|---|
| `04_agencies.agency_type_note` | `government` | `government` |
| | `pmu` | `national_agency` |
| | `private` | `private` |
| | `technical partner` | `ngo` |
| `05_project_partners.role` | `lead` | `lead` |
| | `pmu` | `co_executor` |
| | `implementing` | `co_executor` |
| | `technical` | `technical_partner` |
| `09_components.level` | `Component` / `Sub-component` | picks the target model |
| `11_milestones.status` | `pending` | `pending` |

Everything else in §8's enum list is already model-literal in both files and is validated
strictly — a value outside the choices is an error naming sheet, row and column.

`is_lead=Yes` in `05` sets `ProjectImplementingPartner.role='lead'`; the model's
`unique_lead_partner_per_project` constraint means a second lead is an error, caught in
the parser rather than as an IntegrityError at write time.

---

## 4. Build order

Each step is a commit. Conventional Commits, `feat(asis-import): …`.

1. **`plan.py`** — `ImportPlan`, `PlannedChange`, `ImportIssue` dataclasses, `summary`
   computed from the change list, `to_dict()` producing the §6 wire shape exactly.
   Pure data, no Django import.
2. **`vocab.py`** — the mapping tables above plus the enum sets pulled *from the models*
   (`LIFECYCLE_STAGE_CHOICES` etc.) rather than retyped, so a model change cannot drift
   from the validator.
3. **`parser.py`** — workbook → `ImportPlan`. Header-row detection, cell coercion
   (date/decimal/int/enum), then one function per sheet in §9 write order. Resolves
   references by reading the database; never writes. Every unresolved reference,
   bad enum, missing required field, malformed date, `end_date < start_date` and
   financing/`budget_amount` mismatch (VAL015) becomes an `ImportIssue`. Diffs against
   existing rows are computed here, so `unchanged` is decided by the parser, not guessed
   by the applier.
4. **`applier.py`** — `ImportPlan` → database inside one `transaction.atomic()`, §9 order,
   no re-validation. Replace-all scoped to the project for `FinancingSource` and
   `Milestone` (D-8). Calls `generate_reporting_periods` after the project is written.
   Returns the project id.
5. **`views.py` + route** — `AsisImportView`, `IsAuthenticated + HasModulePermission` on
   `m1_config_access`, `MultiPartParser`. Magic-byte check (`PK\x03\x04`), 5 MB cap,
   `read_only=True, data_only=True`, never persisted (§11). `mode=validate` → 200 or 422;
   `mode=commit` → recompute SHA-256, 409 on mismatch, else parse-and-apply. Both modes
   run the identical parse.
6. **`requirements.txt`** — `openpyxl==3.1.5`.
7. **`backend/tests/test_asis_import.py`** — the five cases §12 names (enum rejection,
   unresolved internal reference, financing reconciliation, upsert diff accuracy, hash
   mismatch → 409) plus blank-cell-does-not-clear and GADM-warning-not-error, built on
   `tests/factories.py` and small in-memory workbooks written with `openpyxl`.
8. **Frontend** — `BulkImport.jsx`, nav wiring, i18n keys. `api.js` already has
   `apiUpload` (the spec's `apiFetchMultipart` under another name); it throws on non-2xx
   but attaches the parsed body to `error.detail`, so the 422 report renders from the
   error path. Confirm is disabled while any error exists and re-sends the same `File`
   object plus `expected_sha256`.

---

## 5. Verification

The suite **cannot be run** — `pytest-django` builds its test database from scratch and
the duplicated `results.0005` migration blocks that. The tests are written to become live
when that lands, and will not be reported as passing.

Nothing may be verified by `docker compose exec` (it reaches the deploy checkout, not this
worktree) and nothing may be brought up from the worktree (it would recreate the deployed
stack against branch code). So: an **ephemeral container from `/home/docker/ARBM-MIS`,
mounting the worktree's backend**, installing `openpyxl` into that container only, and
driving the real view through Django's test client against the shared database.

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml \
  run --rm --no-deps -T \
  -v /home/docker/ARBM-MIS/.claude/worktrees/asis-bulk-import/backend:/app \
  backend sh -c "pip install --quiet openpyxl && python manage.py shell < /app/verify_asis.py"
```

Steps, in the spec's order:

1. `mode=validate` on both workbooks, read both reports.
2. commit **NGA1007** — reading the update diff first, since the row already exists (§1c).
3. inspect in `/admin/`: envelope totalling 95,000,000, 19 logframe rows, 25 activities.
4. re-run validate on NGA1007 — every line must come back `unchanged`. This is the real
   proof upsert works.
5. then SLE1013 — envelope 34,126,000, 15 logframe rows.

**The database is shared and these writes are real.** Steps 2 and 5 will be run only after
the plan is approved, and what was actually run gets recorded in `.dev-notes/history.md` —
data loaded from an unmerged branch is exactly the asymmetry `CLAUDE.md` says to call out.

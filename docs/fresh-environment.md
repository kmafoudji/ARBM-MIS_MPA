# Building an environment from scratch

How to get from an empty database to a working aRBM-MIS, and what a fresh
environment will **not** contain because it exists only in the maintained
database. Two paths: seed everything, or restore a dump.

All commands below run from the deploy checkout with both compose files
([development-environment.md](development-environment.md)):

```bash
alias dc='docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml'
```

## Path A — seed from the code

### 1. Database and schema

The `db` service is `postgis/postgis:15-3.3`; the PostGIS extension is created
by the image on first start. Bring the stack up, wait for `db` to be healthy,
restart the Django services once (first-start pitfall), then migrate:

```bash
dc up -d --build
dc restart backend celery_worker celery_beat
dc exec -T backend python manage.py migrate
```

`migrate` applies every migration from an empty database; CI verifies this on
every push ([testing-and-ci.md](testing-and-ci.md#ci)).

### 2. Accounts and roles

```bash
dc exec backend python manage.py createsuperuser
dc exec -T backend python manage.py seed_rbac_matrix        # permissions (module × action) and the default actors
dc exec -T backend python manage.py normalize_admin_account # optional: turn the bootstrap superuser into a named technical account
```

Entra ID sign-in needs the `ENTRA_*` variables in `.env`; without them the
Django admin at `/admin/` with the superuser is the way in.

### 3. Reference data

Order matters: indicators resolve their sector by name, GADM areas attach to
countries.

```bash
dc exec -T backend python manage.py seed_reference_data   # currencies, 10 hubs, 57 countries, 11 LLF2 sectors — idempotent
dc exec -T backend python manage.py seed_sdg_targets      # the 169 SDG targets — idempotent
dc exec -T backend python manage.py seed_indicators --dry-run
dc exec -T backend python manage.py seed_indicators       # Agriculture catalogue: Crop (A001.*) and FAP (poultry, fisheries, aquaculture)
```

`seed_indicators` defaults to `--sector agriculture` and reads
`backend/apps/results/fixtures/indicators_agriculture.json`; `--update`
refreshes rows that already exist. The Health and Infrastructure catalogues
have no fixture yet.

### 4. Administrative areas (GADM)

```bash
dc exec -T backend python manage.py import_gadm            # names only, Admin 1 and 2, the 57 portfolio countries
dc exec -T backend python manage.py import_gadm --geom     # geometries as well — slow; needed by the map (martin tiles)
```

`--countries ISO3 [ISO3 ...]` and `--level {1,2}` narrow the run. The data is
downloaded from the GADM server at run time; when that host is unreachable
the command reports the failed countries and exits non-zero. Re-run later —
it is idempotent per country.

### 5. Projects

Projects are loaded through the application: **Projects → Bulk Import**
takes the 13-sheet AS-IS workbook and produces a change report before and
after writing. The importer resolves sectors by `Sector.code`, so the sector
codes in the workbook must exist in the database — see the next section.

## What a fresh environment lacks

The maintained development database holds state that no seed, fixture or
migration reproduces. A fresh environment comes up without it.

| What | Where it lives | Effect on a fresh environment |
|---|---|---|
| A placeholder activity renamed for one imported project (SLE-0001, the milestone holder). | database only | Cosmetic; the imported name comes back on a re-import. |
| `TheoryOfChange.status` moved from `locked` to `active` on imported projects. | database only | Imported projects come up with a locked Theory of Change until edited. |
| Scope rows deleted by hand for one project (ALB-0001) that the API had accepted outside the project's countries. | database only | Nothing missing; the API still accepts such rows until validated server-side. |
| Loaded projects (the AS-IS workbooks). | database + the workbooks | Re-import through Bulk Import. |

The sector seed ships the LLF2 taxonomy (three pillars, eight sectors under
them, [decisions/0007](decisions/0007-sector-taxonomy-pillar-then-sector.md))
since 5 September 2026, so a fresh environment resolves the AS-IS workbooks'
sector codes. A project must name a sector, not a pillar. The workbooks written against the earlier slug codes
(`agriculture`, `basic_infrastructure`) fail on `primary_sector` until recoded.

## Path B — restore a dump

The maintained environment is backed up as a `pg_dump` custom-format file plus
an archive of the untracked configuration. To rebuild from them:

```bash
git clone <repository-url> ARBM-MIS      # keep this directory name: local paths assume it
cd ARBM-MIS
tar xzf <path>/config-<stamp>.tar.gz      # .env, the two dev overrides, .git/info/exclude, notes
docker volume create arbm-mes_arbm_mes_pgdata
dc up -d db
dc exec -T db psql -U <user> -d <db> -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
dc exec -T db pg_restore -U <user> -d <db> --clean --if-exists < <path>/db-<stamp>.dump
dc up -d
```

The dump carries `django_migrations`, so no `migrate` step follows; `pg_restore`
warnings about the `postgis` extension already existing are harmless. The
restored database contains everything in the table above.

Cloning needs a credential with access to the repository; on a rebuilt machine
generate a new deploy key and register it on the repository rather than
copying the old one.

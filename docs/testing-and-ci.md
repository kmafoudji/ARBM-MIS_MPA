# Testing and CI

What is verified automatically, what is not, and how to run the checks by hand.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests
targeting it. Three jobs:

| Job | What it runs | What a green result proves |
|---|---|---|
| `backend` | `pip install`, `python manage.py check` | The Django project imports and its system checks pass. |
| `frontend` | `npm install`, `npm run build` | The frontend compiles for production. |
| `migrations` | a PostGIS service, `python manage.py migrate --noinput` from an **empty** database, then `python -m pytest` | Every migration applies from scratch. **The test step is `continue-on-error`**, so the job is green even when tests fail. |

Read the `migrations` job, not the checkmark. The test step is non-blocking
because a set of tests is known to fail while the development setting
`RBAC_ENFORCED` is `False` (see below); it becomes blocking the day those tests
are fixed or marked.

What CI does **not** see: data. Fixtures, seed commands and imports run
against the real environment and their effect is checked there.

## Running the test suite

The suite lives in `backend/tests/` (`pytest`, `pytest-django`, `factory-boy`;
settings `config.settings.test`). It needs `migrate` to work from an empty
database, which it does. From the deploy checkout:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec -T backend python -m pytest
```

`pytest-django` creates its own `test_<database>` on the same PostgreSQL server
and drops it afterwards; the real data is untouched. One module or test:

```bash
... exec -T backend python -m pytest tests/test_sf7_gadm.py
... exec -T backend python -m pytest tests/test_sf4_lifecycle.py -k dual_auth
```

To run a branch's tests without merging, use the ephemeral container from
[development-environment.md](development-environment.md#running-branch-code)
with `python -m pytest` as the command.

### Known failing tests

The dual-approval gate tests (`tests/test_sf4_lifecycle.py`,
`TestTransitionStageGates` and `TestTransitionStageBackward`;
`tests/test_api_projects.py::TestStageTransitionAPI::test_gate_transition_requires_dual_auth_via_api`)
expect a `ValidationError` or an HTTP 400 that the backend only raises when
`RBAC_ENFORCED` is `True`. With the development default they fail. The pending
decision is whether the tests set the flag themselves or document the
development behaviour; until then they are the reason the CI test step does
not block.

## Management commands and data

Commands that write to the database:

| Command | `--dry-run` | Notes |
|---|---|---|
| `seed_indicators` | yes | also `--update` to refresh existing rows and `--sector` |
| `seed_reference_data` | **no** | idempotent |
| `seed_sdg_targets` | **no** | idempotent |
| `import_gadm` | **no** | `--countries`, `--level`, `--geom`; slow with `--geom` |
| `seed_rbac_matrix` | **no** | |

Check `python manage.py <command> --help` before assuming a flag exists. When
a command has no dry run, the alternative is to run it against a restored
copy of the database, or to accept the write and record it.

## Frontend

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec -T frontend npm run build
```

is what CI runs. Vite's dev server also prints warnings on start-up
(`docker compose ... logs frontend`); a `Duplicate key` warning is a latent
bug, not noise.

## What to write down

For every change that touches data — fixtures, seeds, imports, migrations
edited by hand — the commit message or the merge commit says how it was
verified: which command, against which environment, with what result. "CI
passed" means "it imports, builds and migrates", nothing more.

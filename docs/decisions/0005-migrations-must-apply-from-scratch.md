# 0005 — Migrations must apply from an empty database, and CI proves it

## Context

A migration graph that only works on databases that already ran it is
invisible on the machines that have it applied and total everywhere else: a
fresh environment cannot start, and `pytest-django`, which builds its test
database from scratch, cannot run. The failure surfaced once through two
sibling migrations creating the same columns; the emptied duplicate keeps its
file and dependencies so already-migrated databases are unaffected.

## Decision

- `python manage.py migrate` from an empty PostGIS database must succeed on
  `main` at all times.
- The CI job `migrations` applies the whole graph against an empty PostGIS
  service on every push, then runs the test suite.
- A migration already applied in a live database is edited only in a way that
  is a no-op there (emptying it, never renaming or re-ordering it), and the
  change says so.

## Consequences

- The test suite is runnable, in CI and locally.
- `makemigrations --check` is the natural next guard, pending a decision on
  the constraint drift it currently reports.
- The test step in that job is non-blocking until the known failing tests are
  resolved; making it blocking is the intent.

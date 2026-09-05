# Development environment

One Docker Compose stack serves the `main` branch of a **deploy checkout**;
editing happens in git **worktrees** next to it. This page describes that
layout, the three untracked files it needs, and the failure modes that are
silent.

## Layout

```
<repo>/                              ← deploy checkout, branch: main
                                        the only place docker compose runs
<repo>/.claude/worktrees/<name>/     ← one worktree per work branch
                                        editing only, never docker compose
```

All checkouts share one `.git`. A commit made in a worktree is visible from
every other checkout immediately, but changes nobody's files.

The compose file bind-mounts `../backend:/app` and `../frontend:/app` and runs
`runserver` and `vite dev`, so **the code being served is literally the deploy
checkout's working tree**. Two rules follow.

### Rule 1 — `docker compose` runs only from the deploy checkout

The compose project name defaults to the basename of the project directory,
which is `infra` from **any** checkout. Running `docker compose up` from a
worktree does not create a second stack: it recreates the existing one with
`../backend` and `../frontend` now resolving to the worktree. The deployment
silently starts serving branch code, with no error. `up`, `down`, `restart`,
`ps`: deploy checkout only.

### Rule 2 — `docker compose exec` reaches the deploy checkout

`exec` attaches to a running container whose mounts were resolved at `up`
time. Being inside a worktree changes nothing, so a command run with `exec`
reads the deploy checkout's files even when you meant the branch's. To run
branch code, see [Running branch code](#running-branch-code).

### The deploy checkout only receives merges

Never edit files there, never commit anything but a `git merge` there, never
`git checkout` another branch there. `git status --short` in the deploy
checkout is always empty. See [workflow.md](workflow.md#5-merge).

## Untracked local files

Three files adapt the stack to a machine and are deliberately not tracked
(`.git/info/exclude` or `.gitignore`). Create them once per machine.

### `.env`

Copy `.env.example` and fill it in. `DJANGO_SECRET_KEY` is required; the
`ENTRA_*` variables may stay empty (authentication then fails with an explicit
error). The compose services `backend`, `celery_worker` and `celery_beat` load
it; `frontend` does not.

### `infra/docker-compose.dev.yml`

An override that leaves the tracked `infra/docker-compose.yml` untouched. On a
machine exposed to the network it typically:

- resets the published ports (`ports: !reset []`) so only a reverse proxy
  listens on the host;
- puts the `frontend` service on the proxy's network with its routing labels;
- starts Vite with the local config (`command: npm run dev -- --config vite.config.dev.js`);
- sets development-only environment for the frontend.

Skeleton:

```yaml
services:
  backend:
    ports: !reset []
  martin:
    ports: !reset []
  frontend:
    ports: !reset []
    command: npm run dev -- --config vite.config.dev.js
    environment:
      - VITE_DEV_UNLOCK_ALL=true      # see "Development switches"
    # networks / labels for your reverse proxy go here
```

Always pass both files:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml <command>
```

A plain `docker compose` publishes ports that should not be published on an
exposed machine.

### `frontend/vite.config.dev.js`

Extends the tracked `vite.config.js` and only adds the machine's hostname to
`server.allowedHosts`:

```js
import base from "./vite.config.js";

export default {
  ...base,
  server: {
    ...base.server,
    allowedHosts: [...base.server.allowedHosts, "<your-hostname>"],
  },
};
```

The frontend is the only entry point: Vite proxies `/api`, `/auth`, `/health`
and `/media` to `backend` and `/martin` to the tile server, so backend, db,
redis and martin never need a public port.

## Bringing the stack up

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml ps
```

Quick check: `/health/` through the frontend answers 200; `exec backend python
manage.py check` reports no issues.

### First start with an empty database volume

During `initdb` PostgreSQL starts, passes its healthcheck, then restarts to
come up for real. Backend and celery get a connection refused in that window;
Django's autoreloader survives but stops listening, so the container shows
`Up` and the failure surfaces only as a 500. Fix:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml restart backend celery_worker celery_beat
```

Then follow [fresh-environment.md](fresh-environment.md).

### After a change to `frontend/package.json`

`node_modules` lives in an anonymous volume that Compose carries over, so
`up --build` alone does not refresh it:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml rm -sfv frontend
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build frontend
```

### After a change to the frontend environment

Vite reads `VITE_*` variables at start-up. A change in the override's
`environment` requires the container to be recreated (`up -d` does it when
the override changed; otherwise `rm -sfv frontend` first).

### A container `Exited (128)` and not restarting

Symptom in `docker inspect`: `runc create failed: container with given ID
already exists`. The `unless-stopped` policy does not recover from it. Remove
the container and bring the stack up again; the data volume is unaffected:

```bash
docker rm -f infra-db-1            # or whichever container
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml restart backend celery_worker celery_beat
```

## Running branch code

For a management command against a branch's code without touching the stack:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml \
  run --rm --no-deps -T \
  -v <absolute-path-to-worktree>/backend:/app \
  backend python manage.py <command>
```

`run` creates a **new** container, so the `-v` override applies — this is why
it works where `exec` (rule 2) does not. `--rm` disposes of it, `--no-deps`
avoids restarting dependencies, `-T` avoids a TTY. The mount path must be
absolute and end in `/backend`.

**This reaches the real database.** Run `--dry-run` first where the command
supports it, and check that it does ([testing-and-ci.md](testing-and-ci.md#management-commands-and-data)).

For anything a user has to see, there is no intermediate branch: merge into
`main` ([workflow.md](workflow.md#5-merge)) and revert if it must come out.

## Why there is only one stack

Parallel stacks per worktree (`docker compose -p <name>`) would not isolate
anything here:

- **The database volume is external** with a fixed name
  (`arbm-mes_arbm_mes_pgdata`). Separate project names would still share it,
  so migrations and fixtures would collide — the main reason to want parallel
  stacks at all.
- The reverse-proxy labels pin one hostname with a fixed router name; two
  stacks would register duplicate routers.

## Development switches

| Variable | Where | Effect |
|---|---|---|
| `VITE_DEV_UNLOCK_ALL=true` | `frontend` service environment, in the untracked override | Lifts the presentational stage locks in the project detail page (identity, classification, financial, reporting, geographic tabs; Logframe gate) and skips the client-side dual-approval requirement at lifecycle gates. Committed default: off. See [decisions/0003](decisions/0003-dev-unlock-env-flag.md). |
| `RBAC_ENFORCED` | `backend/config/settings/base.py` | `False` in development: every authenticated user is authorised and the backend does not demand a second approver at gates. |

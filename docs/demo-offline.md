# Running a demo without internet

A demo laptop that will have no network when it matters. Everything the
application needs is pulled **while the machine still has internet**; on the
day it starts from local images, a local database and local assets.

The target here is Windows with Docker Desktop, but only the first section is
Windows-specific — the rest applies to any machine prepared this way.

## 1. The machine, while it still has internet

Install **Docker Desktop with the WSL 2 backend** and Git. Signing in to a
Docker account is not required; skip it, so no start-up step depends on the
network.

Clone **inside the WSL filesystem** (`~/ARBM-MIS`), not under `C:\`. The
compose file bind-mounts `../backend` and `../frontend` into the containers,
and those mounts are slow enough across the Windows filesystem boundary to
make the dev server painful.

```bash
git clone <repository-url> ARBM-MIS   # keep the directory name: local paths assume it
cd ARBM-MIS
cp .env.example .env
```

Two edits to `.env`:

- `DJANGO_SECRET_KEY` — any random string.
- `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend` — `backend` is required.
  The Vite proxy uses `changeOrigin: true`, so Django sees `Host: backend:8000`
  on every `/api` request and rejects it otherwise.

The rest of the file is already correct for a machine reached at
`http://localhost:5173`. Leave `ENTRA_*` and `AZURE_*` empty — see section 4.

## 2. Bring the stack up

The committed `infra/docker-compose.yml` already publishes 5173, 8000 and
3000 on the host, so a demo machine needs **no override file**. The override
this project's development server uses exists only to *unpublish* those ports
behind Traefik; do not copy it.

```bash
docker volume create arbm-mes_arbm_mes_pgdata   # the compose volume is external: true
docker compose -f infra/docker-compose.yml up -d --build
```

The `--build` is where the internet is actually spent: base images, apt, pip
and `npm install` all happen here, and the result stays in the local image
cache. **Do not rebuild an image on the day of the demo** — a rebuild needs
the network again.

Then the usual first-start step, because the Django services come up before
the database is ready ([development-environment.md](development-environment.md)):

```bash
docker compose -f infra/docker-compose.yml restart backend celery_worker celery_beat
```

## 3. The data

Restore a dump — do not seed. `import_gadm` and `import_natural_earth`
download from the GADM and Natural Earth servers at run time, so path A of
[fresh-environment.md](fresh-environment.md) cannot be repeated offline, and
without them the map has no boundaries and no basemap. Follow path B of that
page: `CREATE EXTENSION postgis`, then `pg_restore --clean --if-exists`.

Check the tiles answer before trusting the map:

```bash
curl -s localhost:5173/martin/catalog | head
```

## 4. What still wants the network, and what replaces it

| | Offline | Use instead |
|---|---|---|
| Microsoft Entra ID sign-in | fails | the email/password form on the login page (**Sign in with email & password**), against a local Django user. Create one with `createsuperuser` while preparing. |
| Azure Blob Storage | unused | `.env` leaves it empty; Django serves `/media` itself under `DEBUG=True`. |
| GADM / Natural Earth imports | fail | the restored dump (section 3). |
| Google Fonts, `fonts.openmaptiles.org` | — | bundled since `feat(frontend): serve fonts and map glyphs locally`; nothing to do. See `frontend/public/fonts/README.md`. |

## 5. The rehearsal — the only step that actually proves it

Disconnect the machine from every network, **hard-reload** the browser to
defeat its cache (Ctrl+Shift+R), and walk the demo end to end: log in, open a
project, open the portfolio map, zoom until place labels appear, open the
indicator catalogue. Missing labels or a fallback typeface mean something is
still being fetched — the browser's network tab, filtered on failures, names
it.

A demo that was only ever tested with the cable in has not been tested.

## 6. On the day

Start Docker Desktop, wait for the engine, then:

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml restart backend celery_worker celery_beat
```

Open `http://localhost:5173`. The frontend is a Vite dev server: the first
page load compiles and takes a few seconds. Load it once before the audience
is watching.

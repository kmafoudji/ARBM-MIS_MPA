# aRBM-MIS (Adaptive Results-Based Management / Monitoring and Evaluation System)

Adaptive Results-Based Management / Monitoring and Evaluation System for the
LLF2 portfolio (Islamic Development Bank — Lives and Livelihoods Fund 2).

## Stack

- **Backend**: Django 5 + Django REST Framework, PostgreSQL/PostGIS, Redis, Celery
- **Frontend**: React 18 + TanStack Query, Vite — navigation is component
  state; there is no URL router yet
- **Authentication**: Microsoft Entra ID (OAuth2/OIDC via MSAL), MillenniumPromise tenant
- **Infrastructure**: Docker Compose (development) → Azure Container Apps (production, pending)

## Running locally (Ubuntu, Docker)

1. Create the environment file:
   ```bash
   cp .env.example .env
   ```
   Fill in at least `DJANGO_SECRET_KEY`. The `ENTRA_*` variables may stay
   empty for now — the backend starts without them and Entra ID sign-in
   returns an explicit error until they are set.

2. Create the local compose override and Vite config described in
   [docs/development-environment.md](docs/development-environment.md#untracked-local-files),
   then start the services:
   ```bash
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
   ```
   On a machine that is not exposed to a network, the tracked file alone
   (`docker compose -f infra/docker-compose.yml up --build`) publishes the
   ports on `localhost` and is enough.

3. Check that everything is up:
   - Backend health check: http://localhost:8000/health/
   - Frontend: http://localhost:5173

4. Apply the migrations, then follow
   [docs/fresh-environment.md](docs/fresh-environment.md) to seed accounts,
   reference data, indicators and administrative areas:
   ```bash
   docker compose -f infra/docker-compose.yml exec backend python manage.py migrate
   ```

## Repository layout

```
backend/             Django + DRF
  config/            Project settings, urls, wsgi/asgi
  apps/              identity (RBAC, Entra ID), reference, project, results, workplan, …
  core/              Technical endpoints (health check), AS-IS bulk import
  tests/             pytest suite
frontend/            React + TanStack Query + Vite
infra/               Docker Compose
.github/workflows/   CI (backend check, frontend build, migrations from scratch + tests)
docs/                Documentation — start at docs/README.md
```

## Module 1 — Configuration and access control (RBAC)

Domains in place: `identity` (RBAC, SSO/MFA, R26 exemptions), `reference`
(reference data), `project` (skeleton). The default Django user model is
replaced by `identity.AppUser`. A database created with the default model
before that change cannot be migrated forward; it has to be recreated, which
**destroys every row in the local database volume**:

```bash
docker compose -f infra/docker-compose.yml down -v   # deletes the Postgres volume and all its data
docker compose -f infra/docker-compose.yml up --build
docker compose -f infra/docker-compose.yml exec backend python manage.py migrate
docker compose -f infra/docker-compose.yml exec backend python manage.py createsuperuser
```

The models can then be explored at `http://<your-ip>:8000/admin/`.

## Development workflow

One branch per change, Conventional Commits, a pull request that another
developer reviews and approves, merged on GitHub with a merge commit. `main` is
what the development environment serves; the deploy checkout pulls it after
each merge. Details: [docs/workflow.md](docs/workflow.md);
what CI verifies: [docs/testing-and-ci.md](docs/testing-and-ci.md); decisions
in force: [docs/decisions/](docs/decisions/README.md).

## Entra ID configuration

See `.env.example` for the required variables. The App Registration is
created in the MillenniumPromise Entra ID tenant with the redirect URI
`http://localhost:8000/auth/callback` for development.

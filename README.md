# ARBM-MES (Adaptive Results-Based Management/Monitoring and Evaluation System)

Adaptive Results-Based Management/Monitoring and Evaluation System pour le
portefeuille LLF2 (Islamic Development Bank — Lives and Livelihoods Fund 2).

## Stack technique

- **Backend** : Django 5 + Django REST Framework, PostgreSQL/PostGIS, Redis, Celery
- **Frontend** : React 18 + TanStack Query/Router, Vite
- **Authentification** : Microsoft Entra ID (OAuth2/OIDC via MSAL), tenant MillenniumPromise
- **Infra** : Docker Compose (local) → Azure Container Apps (production)

## Démarrer en local (Ubuntu, Docker)

1. Copier le fichier d'environnement :
   ```bash
   cp .env.example .env
   ```
   Remplir au minimum `DJANGO_SECRET_KEY`. Les variables `ENTRA_*` peuvent
   rester vides pour l'instant — le backend démarre sans elles (l'auth
   Entra ID renverra juste une erreur explicite tant qu'elles ne sont pas
   configurées).

2. Lancer les services :
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```

3. Vérifier que tout tourne :
   - Backend (health check) : http://localhost:8000/health/
   - Frontend : http://localhost:5173

4. Appliquer les migrations Django (dans un second terminal, une fois les
   conteneurs lancés) :
   ```bash
   docker compose -f infra/docker-compose.yml exec backend python manage.py migrate
   ```

## Structure du repo

```
backend/            Django + DRF
  config/            Réglages du projet (settings, urls, wsgi/asgi)
  apps/authentication/  Auth Entra ID (MSAL, login/callback)
  core/              Endpoints techniques (health check)
frontend/            React + TanStack + Vite
infra/               Docker Compose
.github/workflows/   CI (vérifie backend + frontend à chaque push)
docs/                Documentation projet
```

## Workflow de développement

1. Le code est développé et poussé sur `main` (ou une branche de feature).
2. Récupération en local (`git pull`) pour test sur machine Ubuntu via
   Docker Compose.
3. Une fois validé, provisioning et déploiement sur Azure (voir
   `docs/azure-infrastructure.md`, à venir).

## Configuration Entra ID

Voir `.env.example` pour la liste des variables requises. L'App
Registration doit être créée dans le tenant Entra ID de MillenniumPromise
avec une redirect URI `http://localhost:8000/auth/callback` en
développement.

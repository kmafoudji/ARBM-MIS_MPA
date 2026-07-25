"""
Configuration Celery pour ARBM-MES.

Worker  : exécute les tâches asynchrones.
Beat    : planificateur cron — déclenche les tâches périodiques.

Tâches périodiques déclarées ici :
  - refresh_reporting_period_statuses  : quotidien à 02h00 UTC
    Parcourt toutes les ReportingPeriod et met à jour leur statut
    (upcoming → open → overdue) en fonction de la date du jour.
"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("arbm_mes")

# Lire la config depuis Django settings (préfixe CELERY_)
app.config_from_object("django.conf:settings", namespace="CELERY")

# Découverte automatique des tasks.py dans chaque app Django
app.autodiscover_tasks()

# ── Beat schedule (cron natif Celery, sans django-celery-beat) ──────────────
app.conf.beat_schedule = {
    "refresh-reporting-period-statuses-daily": {
        "task": "apps.project.tasks.refresh_reporting_period_statuses",
        "schedule": crontab(hour=2, minute=0),  # 02h00 UTC chaque nuit
        "options": {"expires": 3600},           # expire après 1h si non exécuté
    },
}
app.conf.timezone = "UTC"

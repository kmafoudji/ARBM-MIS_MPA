"""
Tâches Celery — Module 3 Workplan.

check_workplan_alerts
    Planifiée quotidiennement à 06h00 UTC.
    Génère les alertes SF-6 : jalons T-30/T-7/T-0/Missed,
    activités overdue, escalades L1/L2/L3, retards pending.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.workplan.tasks.check_workplan_alerts",
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
def check_workplan_alerts(self):
    """
    SF-6 : moteur d'alertes workplan — portefeuille complet.
    RG-6.1 (jalons), RG-6.2 (escalade), RG-6.3 (contexte), RG-7.4 (retards).
    """
    try:
        from .alert_service import run_alert_engine
        result = run_alert_engine(project=None)
        logger.info(
            "SF-6 alert engine — %d project(s) scanned, %d alert(s) created",
            result["projects"], result["created"],
        )
        return result
    except Exception as exc:
        logger.error("SF-6 alert engine — error: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(
    bind=True,
    name="apps.workplan.tasks.check_workplan_alerts_project",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def check_workplan_alerts_project(self, project_id):
    """
    SF-6 : moteur d'alertes pour un seul projet (déclenché à la demande).
    """
    try:
        from apps.project.models import Project
        from .alert_service import run_alert_engine
        project = Project.objects.get(pk=project_id)
        result  = run_alert_engine(project=project)
        logger.info(
            "SF-6 alert engine — project %s — %d alert(s) created",
            project.code, result["created"],
        )
        return result
    except Exception as exc:
        logger.error("SF-6 alert engine project %s — error: %s", project_id, exc, exc_info=True)
        raise self.retry(exc=exc)

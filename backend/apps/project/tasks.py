"""
Tâches Celery — app project.

refresh_reporting_period_statuses
    Planifiée quotidiennement à 02h00 UTC par le beat schedule
    (config/celery.py). Met à jour upcoming/open/overdue sur toutes
    les ReportingPeriod du portefeuille.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.project.tasks.refresh_reporting_period_statuses",
    max_retries=3,
    default_retry_delay=300,  # 5 min entre les tentatives
    acks_late=True,           # acquitter après exécution (pas avant)
)
def refresh_reporting_period_statuses(self):
    """
    Parcourt toutes les ReportingPeriod actives et met à jour leur statut
    en fonction de la date du jour (SF-5 deadline engine).

    upcoming → open     si start_date <= aujourd'hui <= end_date
    upcoming → overdue  si aujourd'hui > due_date
    open     → overdue  si aujourd'hui > due_date

    submitted et approved ne sont jamais modifiés automatiquement.
    """
    try:
        from apps.project.services import refresh_period_statuses
        result = refresh_period_statuses(project=None)  # portefeuille complet
        logger.info(
            "SF-5 deadline engine — %d période(s) mise(s) à jour : %s",
            result["updated"],
            result["detail"],
        )
        return result
    except Exception as exc:
        logger.error("SF-5 deadline engine — erreur : %s", exc, exc_info=True)
        raise self.retry(exc=exc)

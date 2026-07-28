"""
SF-6 — Moteur d'alertes & escalade workplan.
BRQ-3.16 / RG-6.1 / RG-6.2 / RG-6.3

Logique :
  - Jalons : T-30, T-7, T-0, Missed
  - Activités : Overdue + escalade 3 niveaux (15j / 30j / 60j)
  - Retards : révisions en attente d'approbation
  - Déduplication par clé unique (pas de doublon jour J)
"""

import logging
from datetime import date, timedelta

from django.utils import timezone

from .models import Activity, DelayLog, Milestone, WorkplanAlert

logger = logging.getLogger(__name__)


def _create_alert(
    *,
    project,
    alert_type,
    message,
    activity=None,
    milestone=None,
    days_overdue=0,
    assigned_to=None,
    dedup_key,
):
    """
    Crée une alerte si la clé de déduplication n'existe pas encore.
    Retourne (alert, created).
    """
    alert, created = WorkplanAlert.objects.get_or_create(
        dedup_key=dedup_key,
        defaults={
            "project":      project,
            "alert_type":   alert_type,
            "message":      message,
            "activity":     activity,
            "milestone":    milestone,
            "days_overdue": days_overdue,
            "assigned_to":  assigned_to,
            "status":       "active",
        },
    )
    return alert, created


def run_alert_engine(project=None):
    """
    Exécute le moteur d'alertes SF-6 pour un projet ou tout le portefeuille.
    Retourne un dict de statistiques.
    """
    today = date.today()
    stats = {"created": 0, "skipped": 0, "projects": 0}

    # ── Scope ────────────────────────────────────────────────────────────
    from apps.project.models import Project
    if project:
        projects = Project.objects.filter(pk=project.pk, has_workspace=True)
    else:
        projects = Project.objects.filter(
            lifecycle_stage__in=["effective", "implementing", "mid_term_review"],
        ).select_related("workspace")

    for proj in projects:
        stats["projects"] += 1
        created = _process_project(proj, today)
        stats["created"] += created

    logger.info(
        "SF-6 alert engine — %d project(s), %d alert(s) created",
        stats["projects"], stats["created"],
    )
    return stats


def _process_project(project, today):
    """Génère toutes les alertes pour un projet. Retourne le nombre de créations."""
    created_count = 0

    # ── 1. Alertes jalons (RG-6.1) ───────────────────────────────────────
    milestones = Milestone.objects.filter(
        activity__sub_component__component__project=project,
        status__in=["pending", "forecasted"],
        activity__is_active=True,
    ).select_related("activity__sub_component__component__project")

    for ms in milestones:
        days_left = (ms.planned_date - today).days

        if ms.planned_date < today:
            # Missed
            key  = f"milestone_missed:{ms.id}:{today.isoformat()}"
            msg  = (
                f"Milestone '{ms.name}' on activity {ms.activity.code} "
                f"({ms.activity.name}) is {abs(days_left)} day(s) overdue "
                f"(was due {ms.planned_date})."
            )
            _, c = _create_alert(
                project=project, alert_type="milestone_missed", message=msg,
                activity=ms.activity, milestone=ms,
                days_overdue=abs(days_left), dedup_key=key,
            )
            created_count += int(c)

        elif days_left == 0:
            key  = f"milestone_t0:{ms.id}:{today.isoformat()}"
            msg  = f"Milestone '{ms.name}' on activity {ms.activity.code} is due TODAY."
            _, c = _create_alert(
                project=project, alert_type="milestone_t0", message=msg,
                activity=ms.activity, milestone=ms, dedup_key=key,
            )
            created_count += int(c)

        elif days_left <= 7:
            key  = f"milestone_t7:{ms.id}:{today.isoformat()}"
            msg  = (
                f"Milestone '{ms.name}' on activity {ms.activity.code} "
                f"is due in {days_left} day(s) ({ms.planned_date})."
            )
            _, c = _create_alert(
                project=project, alert_type="milestone_t7", message=msg,
                activity=ms.activity, milestone=ms, dedup_key=key,
            )
            created_count += int(c)

        elif days_left <= 30:
            key  = f"milestone_t30:{ms.id}:{today.isoformat()}"
            msg  = (
                f"Milestone '{ms.name}' on activity {ms.activity.code} "
                f"is due in {days_left} day(s) ({ms.planned_date})."
            )
            _, c = _create_alert(
                project=project, alert_type="milestone_t30", message=msg,
                activity=ms.activity, milestone=ms, dedup_key=key,
            )
            created_count += int(c)

    # ── 2. Alertes activités overdue + escalade (RG-6.2) ─────────────────
    activities = Activity.objects.filter(
        sub_component__component__project=project,
        is_active=True,
        status__in=["not_started", "in_progress", "on_hold"],
        progress__lt=100,
    ).select_related("sub_component__component", "responsible_user")

    for act in activities:
        effective_end = act.revised_end or act.planned_end
        if not effective_end or effective_end >= today:
            continue

        days_late = (today - effective_end).days

        # Overdue de base
        key = f"activity_overdue:{act.id}:{today.isoformat()}"
        msg = (
            f"Activity {act.code} '{act.name}' is {days_late} day(s) overdue "
            f"(end was {effective_end}, progress {act.progress}%)."
        )
        _, c = _create_alert(
            project=project, alert_type="activity_overdue", message=msg,
            activity=act, days_overdue=days_late,
            assigned_to=act.responsible_user, dedup_key=key,
        )
        created_count += int(c)

        # Escalade L1 : > 15j → PMU PM (RG-6.2)
        if days_late > 15:
            key = f"escalation_l1:{act.id}:{today.isoformat()}"
            msg = (
                f"[ESCALATION L1 — PMU PM] Activity {act.code} '{act.name}' "
                f"is {days_late} day(s) overdue. Immediate action required."
            )
            _, c = _create_alert(
                project=project, alert_type="escalation_l1", message=msg,
                activity=act, days_overdue=days_late, dedup_key=key,
            )
            created_count += int(c)

        # Escalade L2 : > 30j → Hub régional (RG-6.2)
        if days_late > 30:
            key = f"escalation_l2:{act.id}:{today.isoformat()}"
            msg = (
                f"[ESCALATION L2 — REGIONAL HUB] Activity {act.code} '{act.name}' "
                f"is {days_late} day(s) overdue. Hub review required."
            )
            _, c = _create_alert(
                project=project, alert_type="escalation_l2", message=msg,
                activity=act, days_overdue=days_late, dedup_key=key,
            )
            created_count += int(c)

        # Escalade L3 : > 60j → LLFMU (RG-6.2)
        if days_late > 60:
            key = f"escalation_l3:{act.id}:{today.isoformat()}"
            msg = (
                f"[ESCALATION L3 — LLFMU] Activity {act.code} '{act.name}' "
                f"is {days_late} day(s) overdue. Critical risk — LLFMU intervention required."
            )
            _, c = _create_alert(
                project=project, alert_type="escalation_l3", message=msg,
                activity=act, days_overdue=days_late, dedup_key=key,
            )
            created_count += int(c)

    # ── 3. Retards en attente d'approbation (RG-7.4) ─────────────────────
    pending_delays = DelayLog.objects.filter(
        activity__sub_component__component__project=project,
        approval_status="pending",
        activity__is_active=True,
    ).select_related("activity")

    for delay in pending_delays:
        key = f"delay_pending:{delay.id}"
        msg = (
            f"Delay revision on activity {delay.activity.code} "
            f"(+{delay.variance_days}d, cumulative +{delay.cumulative_variance_days}d) "
            f"is pending approval since {delay.created_at.date()}."
        )
        _, c = _create_alert(
            project=project, alert_type="delay_pending", message=msg,
            activity=delay.activity, days_overdue=delay.variance_days,
            dedup_key=key,
        )
        created_count += int(c)

    # ── 4. Auto-résolution des alertes obsolètes ──────────────────────────
    _auto_resolve(project, today)

    return created_count


def _auto_resolve(project, today):
    """
    Résout automatiquement les alertes dont la condition n'est plus vraie.
    Ex : activité complétée, jalon atteint, retard approuvé.
    """
    # Jalons atteints
    achieved_milestone_ids = list(
        Milestone.objects.filter(
            activity__sub_component__component__project=project,
            status="achieved",
        ).values_list("id", flat=True)
    )
    WorkplanAlert.objects.filter(
        project=project,
        milestone_id__in=achieved_milestone_ids,
        status="active",
        alert_type__in=["milestone_t30", "milestone_t7", "milestone_t0", "milestone_missed"],
    ).update(status="resolved", updated_at=timezone.now())

    # Activités complétées ou annulées
    done_activity_ids = list(
        Activity.objects.filter(
            sub_component__component__project=project,
            status__in=["completed", "cancelled"],
        ).values_list("id", flat=True)
    )
    WorkplanAlert.objects.filter(
        project=project,
        activity_id__in=done_activity_ids,
        status="active",
        alert_type__in=["activity_overdue", "escalation_l1", "escalation_l2", "escalation_l3"],
    ).update(status="resolved", updated_at=timezone.now())

    # Retards approuvés ou rejetés
    WorkplanAlert.objects.filter(
        project=project,
        status="active",
        alert_type="delay_pending",
        activity__delay_logs__approval_status__in=["approved", "rejected"],
    ).update(status="resolved", updated_at=timezone.now())

"""Project overview summary — the figures the Overview screen puts on top.

One endpoint, ``GET /api/projects/{pk}/overview-summary/``, so the Overview
does not have to fan out into the workplan, results, data-quality and
reporting APIs to draw a header. Everything here is read-only and computed
live; nothing is stored.

**What is not in this payload, and why.** The proposed Overview mockup asks
for a financial execution rate, a planned-versus-actual S-curve, a quarterly
burn chart, a procurement exposure and a risk register. None of them can be
computed:

- **no disbursement is recorded anywhere in the schema** — ``FinancingSource``
  holds *commitments* only, the same gap that removes indicators 3.6, 3.8,
  3.9, 4.3 and 4.4 from the Tier III fund dashboard (see
  ``apps/results/fund_performance.py``). So there is no financial execution
  rate, no financial S-curve, no burn, and the start-up chain stops at
  Effectiveness instead of running on to the first disbursement;
- **there is no procurement model** — only the RBAC key ``m8_procurement``
  and the ``Milestone.is_procurement`` flag, both pointing at a module that
  is not built;
- **there is no risk register** — ``Project.risk_rating`` is a single static
  classification, and ``WorkplanAlert`` escalations are schedule delays, not
  risks.

Rather than leave those blank or fill them with a plausible number, the
fields that cannot be computed come back as ``None`` next to a
``*_unavailable`` reason, and the interface says so. This follows the rule
already set by the Tier III dashboard: a screen that quietly shows 0% where
it means "we do not track this" is worse than one that says so.

**Physical progress is a simple average**, not milestone-weighted:
``Milestone`` carries no weight and ``WorkplanSummaryView`` averages
``Activity.progress`` flat. ``method`` says so in the payload so the label
cannot drift from the arithmetic. Budget-weighted progress exists only as
earned value inside ``SPISnapshot``, and only where snapshots were taken.

SCOPE: like every other project endpoint, visibility goes through
``Project.objects.in_scope()`` via ``ProjectInScope``.
"""

from django.db.models import Avg, Count, F, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from core.scope import ProjectInScope

from .models import Project

# The lifecycle stages the start-up chain is drawn from. The fourth link the
# mockup asks for — the first disbursement — has no field to read, and is
# reported as unavailable instead of guessed. These are lifecycle stages, not
# approval gates: decisions/0012 keeps gates out of the interface, so the
# labels name the stage the project reached, never the committee that cleared
# it.
STARTUP_CHAIN_STAGES = [
    ("LS010", "Board approval"),
    ("LS011", "Signature"),
    ("LS012", "Effectiveness"),
]

NO_DISBURSEMENT = "No disbursement is recorded in the system."

# ResultsData.compute_and_save_rag thresholds, repeated here so the counts on
# the Overview and the colours on the Results screen cannot disagree.
ON_TRACK_THRESHOLD = 90


def _months_between(start, end):
    """Whole months from ``start`` to ``end``, never negative."""
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(months, 0)


def _time_block(project, today):
    """Elapsed share of the implementation period, from the project dates."""
    start, end = project.start_date, project.end_date
    if not start or not end or end <= start:
        return {
            "start_date": start, "end_date": end,
            "elapsed_pct": None, "months_total": None,
            "months_elapsed": None, "months_left": None,
            "elapsed_unavailable": "The project has no start and end date.",
        }
    total_days = (end - start).days
    elapsed_days = min(max((today - start).days, 0), total_days)
    return {
        "start_date": start,
        "end_date": end,
        "elapsed_pct": round(elapsed_days / total_days * 100, 1),
        "months_total": _months_between(start, end),
        "months_elapsed": _months_between(start, min(today, end)),
        "months_left": _months_between(today, end) if today < end else 0,
        "elapsed_unavailable": None,
    }


def _physical_block(project, today):
    """Activity progress and the overdue count, as WorkplanSummaryView reads them."""
    from apps.workplan.models import Activity

    activities = Activity.objects.filter(
        sub_component__component__project=project, is_active=True,
    )
    total = activities.count()
    if not total:
        return {
            "progress_pct": None, "method": None,
            "activities_total": 0, "activities_overdue": 0,
            "most_overdue": [],
            "progress_unavailable": "This project has no workplan yet.",
        }

    overdue = activities.filter(
        progress__lt=100,
        status__in=["not_started", "in_progress", "on_hold"],
    ).filter(
        Q(revised_end__lt=today) | Q(revised_end__isnull=True, planned_end__lt=today)
    ).annotate(
        # The date the activity is actually late against — a revision moves
        # it, and sorting on revised_end alone would push every unrevised
        # activity to the end of the list on NULLS LAST.
        effective_end=Coalesce(F("revised_end"), F("planned_end"))
    )
    return {
        "progress_pct": round(float(activities.aggregate(a=Avg("progress"))["a"] or 0), 1),
        # Not milestone-weighted: Milestone has no weight field. Named so the
        # interface cannot claim a weighting the arithmetic does not do.
        "method": "simple_average",
        "activities_total": total,
        "activities_overdue": overdue.count(),
        "most_overdue": [
            {
                "code": a.code,
                "name": a.name,
                "days_overdue": (today - a.effective_end).days,
            }
            for a in overdue.order_by("effective_end")[:2]
        ],
        "progress_unavailable": None,
    }


def _financial_block(project):
    """Commitments by financing source. Execution is not knowable — see the module docstring."""
    from .models import FinancingSource

    sources = list(
        FinancingSource.objects.filter(envelope__project=project)
        .select_related("currency")
        .order_by("order", "pk")
    )
    committed = sum((s.amount_usd for s in sources), start=0)
    return {
        "committed_usd": str(committed) if sources else None,
        "sources": [
            {
                "label": s.label or s.get_source_display(),
                "source": s.source,
                "instrument": s.instrument,
                "amount_usd": str(s.amount_usd),
                "share_pct": round(float(s.amount_usd) / float(committed) * 100, 1) if committed else None,
            }
            for s in sources
        ],
        # Deliberately null, with the reason: commitments are not execution.
        "disbursed_usd": None,
        "disbursed_pct": None,
        "disbursed_unavailable": NO_DISBURSEMENT,
    }


def _reporting_block(project, today):
    """The next cut-off and how the register stands against it."""
    periods = project.reporting_periods.all()
    if not periods.exists():
        return {
            "next_due_date": None, "next_label": None, "next_status": None,
            "days_to_cutoff": None, "open_count": 0, "overdue_count": 0,
            "reporting_unavailable": "No reporting period has been generated.",
        }
    upcoming = periods.filter(due_date__gte=today).order_by("due_date").first()
    counts = periods.aggregate(
        open_count=Count("pk", filter=Q(status="open")),
        overdue_count=Count("pk", filter=Q(status="overdue")),
    )
    return {
        "next_due_date": upcoming.due_date if upcoming else None,
        "next_label": upcoming.label if upcoming else None,
        "next_status": upcoming.status if upcoming else None,
        "days_to_cutoff": (upcoming.due_date - today).days if upcoming else None,
        "open_count": counts["open_count"],
        "overdue_count": counts["overdue_count"],
        "reporting_unavailable": None,
    }


def _indicators_block(project):
    """Indicator counts against the RAG thresholds, from the latest approved value."""
    from apps.results.models import LogframeRow, ResultsData

    row_ids = list(
        LogframeRow.objects.filter(project=project).values_list("pk", flat=True)
    )
    if not row_ids:
        return {
            "total": 0, "on_track": 0, "off_track": 0, "not_reported": 0,
            "average_achievement": None,
            "indicators_unavailable": "This project has no logframe yet.",
        }

    # Latest approved value per row — the same reading as ProjectMapPointsView.
    latest = {}
    for row_id, rate in (
        ResultsData.objects.filter(
            logframe_row_id__in=row_ids, status="approved", achievement_rate__isnull=False,
        )
        .order_by("logframe_row_id", "reporting_period__end_date")
        .values_list("logframe_row_id", "achievement_rate")
    ):
        latest[row_id] = float(rate)

    rates = list(latest.values())
    on_track = sum(1 for r in rates if r >= ON_TRACK_THRESHOLD)
    return {
        "total": len(row_ids),
        "on_track": on_track,
        "off_track": len(rates) - on_track,
        "not_reported": len(row_ids) - len(rates),
        "average_achievement": round(sum(rates) / len(rates), 1) if rates else None,
        "indicators_unavailable": None,
    }


def _data_quality_block(project):
    """The composite DQ score and its four dimensions, averaged over the logframe."""
    from apps.results.dq_service import compute_dq_score
    from apps.results.models import LogframeRow

    rows = list(LogframeRow.objects.filter(project=project))
    if not rows:
        return {
            "composite": None, "completeness": None, "timeliness": None,
            "consistency": None, "accuracy": None, "indicators_scored": 0,
            "dq_unavailable": "This project has no logframe yet.",
        }
    dimensions = ["completeness", "timeliness", "consistency", "accuracy", "composite"]
    totals = {d: 0.0 for d in dimensions}
    for row in rows:
        scores = compute_dq_score(row)
        for d in dimensions:
            totals[d] += float(scores[d])
    return {
        **{d: round(totals[d] / len(rows), 1) for d in dimensions},
        "indicators_scored": len(rows),
        "dq_unavailable": None,
    }


def _startup_chain(project):
    """Board approval → Signature → Effectiveness, with the gaps between them.

    The first disbursement, which the mockup puts at the end of the chain, is
    reported as unavailable: nothing records it.
    """
    dates = {}
    for transition in project.stage_transitions.all():
        if transition.to_stage in dict(STARTUP_CHAIN_STAGES):
            when = transition.transition_date or transition.transitioned_at.date()
            # Keep the earliest passage: a rollback and a second entry into
            # the same stage should not move the chain forward.
            if transition.to_stage not in dates or when < dates[transition.to_stage]:
                dates[transition.to_stage] = when

    steps = [
        {"stage": code, "label": label, "date": dates.get(code), "unavailable": None}
        for code, label in STARTUP_CHAIN_STAGES
    ]
    steps.append({
        "stage": None, "label": "First disbursement",
        "date": None, "unavailable": NO_DISBURSEMENT,
    })

    gaps = []
    for before, after in zip(steps, steps[1:]):
        gaps.append(
            _months_between(before["date"], after["date"])
            if before["date"] and after["date"] else None
        )
    return {"steps": steps, "gaps_months": gaps}


def _escalations_block(project):
    """Active schedule escalations. Not a risk register — see the module docstring."""
    from apps.workplan.models import WorkplanAlert

    alerts = WorkplanAlert.objects.filter(
        project=project, status="active",
        alert_type__in=["escalation_l1", "escalation_l2", "escalation_l3"],
    ).order_by("-alert_type", "-created_at")
    top = alerts.first()
    return {
        "active_count": alerts.count(),
        "top": {
            "level": top.alert_type,
            "message": top.message,
        } if top else None,
        # The cockpit tile the mockup labels "Top risk" cannot be filled.
        "risk_register_unavailable": "There is no risk register in the system; "
                                     "these are schedule escalations.",
        "risk_rating": project.risk_rating,
    }


class ProjectOverviewSummaryView(APIView):
    """GET /api/projects/{pk}/overview-summary/ — the Overview header figures."""

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def get(self, request, pk):
        project = Project.objects.get(pk=pk)
        today = timezone.now().date()
        return Response({
            "time": _time_block(project, today),
            "physical": _physical_block(project, today),
            "financial": _financial_block(project),
            "reporting": _reporting_block(project, today),
            "indicators": _indicators_block(project),
            "data_quality": _data_quality_block(project),
            "startup_chain": _startup_chain(project),
            "escalations": _escalations_block(project),
        })

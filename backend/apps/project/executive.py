"""Executive portfolio — the Fund's portfolio as leadership reads it.

One endpoint, ``GET /api/projects/executive-summary/``, behind the Executive
Dashboard. It serves the portfolio overview as the committee reads it —
distribution, status, pipeline and approvals — together with the execution and
attention figures that the deck has no slide for. All of it is read-only and
computed live from the shared record; nothing is stored and nothing is typed
in.

**Much of the mockup has no source.** The rule is the one set by the Tier III
dashboard (``apps/results/fund_performance.py``) and the project overview
(``overview.py``): a figure that cannot be computed comes back as ``None``, or
as a block holding only ``unavailable``, with the reason — never as a zero.

- **no disbursement is recorded anywhere in the schema** — ``FinancingSource``
  holds commitments. Gone: the disbursed amount and rate, disbursement by
  pipeline year, by sector, by hub and by project, the financial leg of the
  execution triad, and the last link of the start-up chain;
- **there is no contract or procurement model** — contracts signed by year,
  the contract risk profile and the procurement method mix;
- ``Country`` carries **no region** — the regional split;
- **concessionality tiers are not recorded** — the 35% versus 10–15%
  grant-eligibility split exists only as free text in ``FinancingSource.label``;
- **nothing records a country suspension** — only a project can be marked
  Suspended (LS017), and that is what the attention list counts;
- **no date is recorded for a stage not yet reached** — the expected board
  approval cycle of each pipeline project, which the deck tabulates;
- **nothing is stored as of a past date** — every figure is current, so none
  can carry the change since the previous committee.

**Pipeline year** is the year a project was IC-endorsed (LS006), read from the
dated stage transitions exactly as the Tier III timelines read them. A project
with no dated endorsement has no pipeline year and is counted apart.

**Averages are simple.** Time elapsed and physical progress are averaged over
projects, not weighted by commitment; physical progress is itself a simple
average of activity progress, since ``Milestone`` carries no weight. The
payload names the method so the labels cannot drift from the arithmetic.

**Milestones are a reading of stages.** The deck presents seven milestones;
the record keeps the fifteen nominal stages. ``DECK_MILESTONES`` holds the
crosswalk, and a project sits at the milestone covering the stage it is in —
the last one it reached. Nothing is stored twice.

**Lifecycle buckets name stages, not gates.** ``decisions/0012`` keeps approval
gates out of the interface, so TRC clearance, IC endorsement and board
approval are pre-approval stages like any other.

Scope: every figure honours ``Project.objects.in_scope(request)`` and, through
it, the hub chosen in the topbar. ``?type=`` (``llf`` by default, or
``isdb``) keeps one project type (ADR 0014): the sectors, the pillars and the
cycles are that type's. ``?cycle=`` (LLF1, LLF2 or ``none`` for LLF, IsDB for
IsDB) and ``?sector=`` (a sector of that taxonomy, or an IsDB pillar and its
sectors) narrow it further.
"""
from collections import defaultdict

from django.db.models import Avg, Count, Min, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from apps.reference.filters import read_project_type, read_sector_id, sector_q

from .models import (
    INVESTMENT_CYCLE_CHOICES,
    LIFECYCLE_STAGE_CHOICES,
    ComponentAllocation,
    FinancingSource,
    Project,
    ReportingPeriod,
)
from .overview import NO_DISBURSEMENT, _data_quality_block, _time_block

NO_CONTRACTS = "There is no contract or procurement model in the system."
NO_REGION = "Countries carry no region."
NO_GRANT_TIER = (
    "Concessionality tiers are not recorded; the grant share of a loan "
    "appears only as free text in the financing line."
)
NO_COUNTRY_SUSPENSION = (
    "Nothing records a country suspension; only a project can be marked Suspended."
)
NO_EXPECTED_BED = (
    "No expected board-approval date is recorded; the lifecycle keeps the dates "
    "of stages reached, not of stages foreseen."
)
NO_TRC_BASELINE = (
    "Nothing is stored as of a past date, so no figure can be compared with the "
    "one presented at the previous committee."
)

STAGE_LABELS = dict(LIFECYCLE_STAGE_CHOICES)

# The lifecycle grouped as the mockup groups it, one bucket per column. The
# phase names the colour the interface gives the bucket; it matches the phases
# of the former dashboard, with Appraisal moved to pre-approval where it sits
# in the September 2026 order (before board approval).
LIFECYCLE_BUCKETS = [
    ("concept",        "Concept note",          ["LS001"],                            "pre_approval"),
    ("pipeline",       "Pipeline review",       ["LS002", "LS003"],                   "pre_approval"),
    ("preparation",    "Preparation",           ["LS004", "LS005", "LS006", "LS007", "LS008"], "pre_approval"),
    ("appraisal",      "Appraisal",             ["LS009"],                            "pre_approval"),
    ("board",          "Board approval",        ["LS010"],                            "pre_approval"),
    ("signature",      "Signature",             ["LS011"],                            "implementation"),
    ("effective",      "Effective",             ["LS012"],                            "implementation"),
    ("implementing",   "Implementing",          ["LS013", "LS014"],                   "implementation"),
    ("closing",        "Completion & closure",  ["LS015", "LS016"],                   "closure"),
    ("exception",      "Suspended or cancelled", ["LS017", "LS018"],                  "exception"),
]
BUCKET_OF_STAGE = {code: key for key, _l, codes, _p in LIFECYCLE_BUCKETS for code in codes}

# Projects whose implementation clock is running: effective through
# substantially complete. The time and physical averages rest on these.
ACTIVE_STAGES = {"LS012", "LS013", "LS014", "LS015"}

STAGE_IC_ENDORSED = "LS006"

# The seven milestones the portfolio overview presents, and the lifecycle
# stages each one covers. The deck names milestones; the record keeps stages,
# and the crosswalk lives here so the two cannot drift. A project sits at the
# milestone its current stage belongs to — the last one it reached.
DECK_MILESTONES = [
    ("m0", "Pending IC endorsement",         ["LS001", "LS002", "LS003", "LS004", "LS005"]),
    ("m1", "IC endorsement",                 ["LS006"]),
    ("m2", "Preparation / appraisal",        ["LS007", "LS008", "LS009"]),
    ("m3", "Board approval",                 ["LS010"]),
    ("m4", "Financing agreement signature",  ["LS011"]),
    ("m5", "Effectiveness",                  ["LS012"]),
    ("m6", "Implementing",                   ["LS013", "LS014"]),
    ("m7", "Complete",                       ["LS015", "LS016"]),
    # Off the sequence: the deck has no column for these and a project in one
    # of them has left the chain rather than stopped along it.
    ("exception", "Suspended or cancelled",  ["LS017", "LS018"]),
]
MILESTONE_OF_STAGE = {code: key for key, _l, codes in DECK_MILESTONES for code in codes}

# The start-up chain, IC endorsement to the first money. The last link has no
# field to read and is reported unavailable.
STARTUP_CHAIN = [
    ("LS006", "IC endorsement"),
    ("LS010", "Board approval"),
    ("LS011", "Signature"),
    ("LS012", "Effectiveness"),
]

ESCALATION_TYPES = ["escalation_l1", "escalation_l2", "escalation_l3"]
WATCHLIST_SIZE = 10
CYCLES = tuple(code for code, _label in INVESTMENT_CYCLE_CHOICES)


def _pct(part, whole):
    if not whole:
        return None
    return round(float(part) * 100 / float(whole), 1)


def _usd(value):
    return float(value or 0)


def _committed(rows):
    """Committed USD over project rows, or None when none of them is funded."""
    amounts = [r["committed_usd"] for r in rows if r["committed_usd"] is not None]
    return sum(amounts) if amounts else None


def _share_rows(rows):
    """Add a share to label/value rows and sort them largest first.

    A row whose value is ``None`` has nothing recorded: it gets no share and
    sorts last, rather than reading as a zero slice.
    """
    total = sum(r["value"] for r in rows if r["value"] is not None)
    for r in rows:
        r["share"] = _pct(r["value"], total) if r["value"] is not None else None
    return sorted(rows, key=lambda r: (r["value"] is None, -(r["value"] or 0)))


# ---------------------------------------------------------------------------
# Scope and filters
# ---------------------------------------------------------------------------

def cycles_of_type(project_type):
    """The cycles of a project type; LLF also counts projects with none."""
    if project_type == "isdb":
        return ("IsDB",)
    return (*(c for c in CYCLES if c != "IsDB"), None)


def _filtered_projects(request):
    params = request.query_params
    project_type = read_project_type(params)
    projects = Project.objects.in_scope(request).of_taxonomy(project_type)
    cycles = cycles_of_type(project_type)

    cycle = params.get("cycle")
    if cycle:
        allowed = [c or "none" for c in cycles]
        if cycle not in allowed:
            raise ValidationError({"cycle": f"Expected {', '.join(allowed)}."})
        if cycle == "none":
            projects = projects.filter(investment_cycle__isnull=True)
        else:
            projects = projects.filter(investment_cycle=cycle)

    sector = read_sector_id(params)
    if sector:
        # A pillar (ADR 0007) takes its sectors with it.
        projects = projects.filter(sector_q("primary_sector", sector))

    return (
        projects
        .select_related("hub", "primary_sector__parent")
        .prefetch_related("project_countries__country__hub", "stage_transitions")
        .order_by("official_reference_number", "pk")
    ), {"type": project_type, "cycle": cycle or None, "sector": sector}


def _hub_name(project):
    """The project's own hub, else its lead country's — as ``hub_q`` matches."""
    if project.hub_id:
        return project.hub.name
    lead = _lead_country(project)
    return lead.hub.name if lead and lead.hub_id else None


def _lead_country(project):
    for pc in project.project_countries.all():
        if pc.is_lead:
            return pc.country
    return None


def _stage_dates(project):
    """First dated entry into each stage, from the prefetched transitions.

    Only ``transition_date`` counts — the date the stage actually changed — as
    in the Tier III timelines; a transition without one is skipped.
    """
    dates = {}
    for t in project.stage_transitions.all():
        if t.transition_date and (
            t.to_stage not in dates or t.transition_date < dates[t.to_stage]
        ):
            dates[t.to_stage] = t.transition_date
    return dates


def _months(start, end):
    return round((end - start).days / 30.44, 1)


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------

def _project_rows(projects, committed, today):
    rows = []
    for p in projects:
        lead = _lead_country(p)
        sector = p.primary_sector
        pillar = sector.pillar if sector else None  # None in LLF (ADR 0014)
        dates = _stage_dates(p)
        endorsed = dates.get(STAGE_IC_ENDORSED)
        rows.append({
            "id": p.pk,
            "code": p.official_reference_number,
            "name": p.name,
            "cycle": p.investment_cycle,
            "stage": p.lifecycle_stage,
            "stage_label": STAGE_LABELS.get(p.lifecycle_stage, p.lifecycle_stage),
            "bucket": BUCKET_OF_STAGE.get(p.lifecycle_stage),
            "hub": _hub_name(p),
            "sector": sector.name if sector else None,
            "sector_color": (sector.color or None) if sector else None,
            "pillar": pillar.name if pillar else None,
            "pillar_color": (pillar.color or None) if pillar else None,
            "lead_country": lead.name if lead else None,
            "lead_iso2": lead.iso2 if lead else None,
            "countries": [pc.country.name for pc in p.project_countries.all()],
            "committed_usd": committed.get(p.pk),
            "pipeline_year": endorsed.year if endorsed else None,
            "start_date": p.start_date,
            "end_date": p.end_date,
            "_dates": dates,
            "_time": _time_block(p, today),
        })
    return rows


def _headline(rows, project_ids, cycles):
    sources = FinancingSource.objects.filter(envelope__project_id__in=project_ids)
    totals = sources.aggregate(
        total=Sum("amount_usd"),
        grant=Sum("amount_usd", filter=Q(instrument="grant")),
        ocr=Sum("amount_usd", filter=Q(source="isdb_oc")),
    )
    total, grant, ocr = (_usd(totals[k]) for k in ("total", "grant", "ocr"))

    by_cycle = []
    for key in cycles:
        members = [r for r in rows if r["cycle"] == key]
        if members or key:
            by_cycle.append({
                "key": key,
                "label": key or "No cycle",
                "count": len(members),
                "value": _committed(members),
            })

    countries = {c for r in rows for c in r["countries"]}
    sdgs = (
        Project.sdgs.through.objects.filter(project_id__in=project_ids)
        .values("sdg_id").distinct().count()
    )
    return {
        "projects": len(rows),
        "projects_by_cycle": by_cycle,
        "projects_without_financing": sum(1 for r in rows if r["committed_usd"] is None),
        "portfolio_usd": total if total else None,
        "countries": len(countries),
        "hubs": len({r["hub"] for r in rows if r["hub"]}),
        "grant_usd": grant if total else None,
        "grant_share_pct": _pct(grant, total),
        # OCR raised per dollar of grant, the leverage the monthly update quotes.
        "ocr_per_grant": round(ocr / grant, 2) if grant else None,
        "sdgs": sdgs,
        "disbursed_usd": None,
        "disbursed_pct": None,
        "disbursed_unavailable": NO_DISBURSEMENT,
    }


def _group_usd(rows, key, color_key=None, fallback="Unclassified"):
    groups = {}
    for r in rows:
        label = r[key] or fallback
        g = groups.setdefault(label, {
            # None until a member has financing: a group of unfunded projects
            # has no amount, not an amount of zero.
            "label": label, "value": None, "count": 0,
            "color": r[color_key] if color_key else None,
        })
        g["count"] += 1
        if r["committed_usd"] is not None:
            g["value"] = (g["value"] or 0) + r["committed_usd"]
    return _share_rows(list(groups.values()))


def _breakdowns(rows, project_ids, project_type):
    sources = FinancingSource.objects.filter(envelope__project_id__in=project_ids)
    source_labels = dict(FinancingSource._meta.get_field("source").choices)
    instrument_labels = dict(FinancingSource._meta.get_field("instrument").choices)

    by_source = _share_rows([
        {"label": source_labels.get(r["source"], r["source"]), "value": _usd(r["t"])}
        for r in sources.values("source").annotate(t=Sum("amount_usd"))
    ])
    by_instrument = _share_rows([
        {"label": instrument_labels.get(r["instrument"], r["instrument"]), "value": _usd(r["t"])}
        for r in sources.values("instrument").annotate(t=Sum("amount_usd"))
    ])

    component_labels = dict(ComponentAllocation._meta.get_field("component").choices)
    by_work_type = _share_rows([
        {"label": component_labels.get(r["component"], r["component"]), "value": _usd(r["t"])}
        for r in ComponentAllocation.objects.filter(envelope__project_id__in=project_ids)
        .values("component").annotate(t=Sum("amount_usd"))
    ])

    dated = [r for r in rows if r["pipeline_year"]]
    years = defaultdict(list)
    for r in dated:
        years[r["pipeline_year"]].append(r)
    # Chronological, not largest first: the years are read as a sequence.
    by_year = [
        {"label": str(year), "year": year, "value": _committed(members), "count": len(members)}
        for year, members in sorted(years.items())
    ]
    total_dated = sum(r["value"] for r in by_year if r["value"] is not None)
    for row in by_year:
        row["share"] = _pct(row["value"], total_dated) if row["value"] is not None else None

    return {
        "by_cycle": _group_usd(rows, "cycle", fallback="No cycle"),
        # LLF has no pillars (ADR 0014).
        "by_pillar": (
            _group_usd(rows, "pillar", "pillar_color", "No sector") if project_type == "isdb" else []
        ),
        "by_sector": _group_usd(rows, "sector", "sector_color", "No sector"),
        "by_hub": _group_usd(rows, "hub", fallback="No hub"),
        "by_pipeline_year": {
            "rows": by_year,
            "projects_without_year": len(rows) - len(dated),
            "unavailable": None if by_year else (
                "No project has a dated IC endorsement, so none has a pipeline year."
            ),
        },
        "by_source": by_source,
        "by_instrument": by_instrument,
        "by_work_type": by_work_type,
        "by_project": sorted(
            (
                {"id": r["id"], "code": r["code"], "name": r["name"],
                 "cycle": r["cycle"], "value": r["committed_usd"]}
                for r in rows if r["committed_usd"] is not None
            ),
            key=lambda r: r["value"], reverse=True,
        ),
        "by_region": {"unavailable": NO_REGION},
        "expected_bed": {"unavailable": NO_EXPECTED_BED},
        "trc_delta": {"unavailable": NO_TRC_BASELINE},
        "by_grant_tier": {"unavailable": NO_GRANT_TIER},
        "disbursement": {"unavailable": NO_DISBURSEMENT},
        "contracts": {"unavailable": NO_CONTRACTS},
        "procurement": {"unavailable": NO_CONTRACTS},
    }


def _lifecycle(rows, cycles):
    buckets = []
    for key, label, codes, phase in LIFECYCLE_BUCKETS:
        members = [r for r in rows if r["bucket"] == key]
        buckets.append({
            "key": key,
            "label": label,
            "stages": [{"code": c, "label": STAGE_LABELS[c]} for c in codes],
            "phase": phase,
            "count": len(members),
            "value": _committed(members),
            "by_cycle": {
                (cycle or "none"): sum(1 for r in members if r["cycle"] == cycle)
                for cycle in cycles
            },
        })
    return buckets


def _milestones(rows):
    """The portfolio by the deck's seven milestones, each naming its stages.

    Every milestone carries its projects, so the pipeline view can list them
    without a second request; a project with no financing line keeps a null
    amount rather than a zero.
    """
    milestones = []
    for key, label, codes in DECK_MILESTONES:
        members = [r for r in rows if MILESTONE_OF_STAGE.get(r["stage"]) == key]
        milestones.append({
            "key": key,
            "label": label,
            "stages": [{"code": c, "label": STAGE_LABELS[c]} for c in codes],
            "count": len(members),
            "value": _committed(members),
            "projects": [
                {
                    "id": r["id"], "code": r["code"], "name": r["name"],
                    "cycle": r["cycle"], "stage_label": r["stage_label"],
                    "sector": r["sector"], "sector_color": r["sector_color"],
                    "lead_country": r["lead_country"], "lead_iso2": r["lead_iso2"],
                    "committed_usd": r["committed_usd"],
                    "pipeline_year": r["pipeline_year"],
                }
                for r in members
            ],
        })
    return milestones


def _progress_by_project(project_ids):
    from apps.workplan.models import Activity

    return {
        pid: round(float(avg), 1)
        for pid, avg in (
            Activity.objects.filter(
                is_active=True, sub_component__component__project_id__in=project_ids,
            )
            .values("sub_component__component__project_id")
            .annotate(avg=Avg("progress"))
            .values_list("sub_component__component__project_id", "avg")
        )
        if avg is not None
    }


def _execution(rows, progress):
    active = [r for r in rows if r["stage"] in ACTIVE_STAGES]
    times = [r["_time"]["elapsed_pct"] for r in active if r["_time"]["elapsed_pct"] is not None]
    physical = [progress[r["id"]] for r in active if r["id"] in progress]
    return {
        "active_projects": len(active),
        "time_elapsed_pct": round(sum(times) / len(times), 1) if times else None,
        "time_projects": len(times),
        "time_unavailable": None if times else "No active project has a start and end date.",
        "physical_pct": round(sum(physical) / len(physical), 1) if physical else None,
        "physical_projects": len(physical),
        "physical_method": "simple_average",
        "physical_unavailable": None if physical else "No active project has a workplan.",
        "financial_pct": None,
        "financial_unavailable": NO_DISBURSEMENT,
    }


def _startup_chain(rows):
    steps = [{"stage": code, "label": label, "unavailable": None} for code, label in STARTUP_CHAIN]
    steps.append({"stage": None, "label": "First disbursement", "unavailable": NO_DISBURSEMENT})

    gaps = []
    for before, after in zip(steps, steps[1:]):
        if not before["stage"] or not after["stage"]:
            gaps.append({"months": None, "projects": 0, "unavailable": NO_DISBURSEMENT})
            continue
        spans = [
            _months(r["_dates"][before["stage"]], r["_dates"][after["stage"]])
            for r in rows
            if before["stage"] in r["_dates"] and after["stage"] in r["_dates"]
            and r["_dates"][after["stage"]] >= r["_dates"][before["stage"]]
        ]
        gaps.append({
            "months": round(sum(spans) / len(spans), 1) if spans else None,
            "projects": len(spans),
            "unavailable": None,
        })

    # Signature → effectiveness by the year of signature: a cohort read of
    # dated transitions, not a snapshot series, so it invents no history.
    cohorts = defaultdict(list)
    for r in rows:
        signed, effective = r["_dates"].get("LS011"), r["_dates"].get("LS012")
        if signed and effective and effective >= signed:
            cohorts[signed.year].append(_months(signed, effective))
    by_year = [
        {"year": year, "months": round(sum(v) / len(v), 1), "projects": len(v)}
        for year, v in sorted(cohorts.items())
    ]
    return {"steps": steps, "gaps": gaps, "signature_to_effective_by_year": by_year}


def _results(rows, project_ids, project_type):
    """RAG of the latest approved value of every logframe row, by pillar.

    By sector for LLF, which has no pillars (ADR 0014); ``group_level`` says
    which.
    """
    from apps.results.models import LogframeRow, ResultsData

    group_level = "pillar" if project_type == "isdb" else "sector"
    pillar_of = {r["id"]: r[group_level] or "No sector" for r in rows}
    row_project = dict(
        LogframeRow.objects.filter(project_id__in=project_ids).values_list("pk", "project_id")
    )
    latest = {}
    for row_id, rag in (
        ResultsData.objects.filter(logframe_row_id__in=row_project, status="approved")
        .order_by("logframe_row_id", "reporting_period__end_date")
        .values_list("logframe_row_id", "rag_status")
    ):
        latest[row_id] = rag

    keys = {"green": "on_track", "amber": "at_risk", "red": "off_track"}
    blank = {"on_track": 0, "at_risk": 0, "off_track": 0, "no_data": 0}
    totals = dict(blank)
    by_pillar = defaultdict(lambda: dict(blank))
    for row_id, project_id in row_project.items():
        # "na" is an approved value with no target for the period: no status.
        key = keys.get(latest.get(row_id), "no_data")
        totals[key] += 1
        by_pillar[pillar_of[project_id]][key] += 1

    return {
        **totals,
        "indicators": len(row_project),
        "group_level": group_level,
        "by_group": [{"label": label, **counts} for label, counts in sorted(by_pillar.items())],
        "unavailable": None if row_project else "No project in scope has a logframe.",
    }


def _attention(rows, project_ids, today):
    from apps.results.models import ResultsData
    from apps.workplan.models import WorkplanAlert

    code_of = {r["id"]: r["code"] for r in rows}
    items = []

    overdue = ReportingPeriod.objects.filter(project_id__in=project_ids, status="overdue")
    oldest = overdue.order_by("due_date").values("project_id", "due_date").first()
    items.append({
        "key": "overdue_reporting",
        "tone": "bad",
        "count": overdue.count(),
        "projects": overdue.values("project_id").distinct().count(),
        "detail": (
            f"{code_of.get(oldest['project_id'])} longest · "
            f"{(today - oldest['due_date']).days} days past due"
        ) if oldest else None,
        "unavailable": None,
    })

    waiting = ResultsData.objects.filter(
        logframe_row__project_id__in=project_ids, status__in=["submitted", "reviewed"],
    )
    first_submitted = waiting.aggregate(t=Min("submitted_at"))["t"]
    items.append({
        "key": "awaiting_review",
        "tone": "good",
        "count": waiting.count(),
        "projects": waiting.values("logframe_row__project_id").distinct().count(),
        "detail": (
            f"oldest submitted {(today - first_submitted.date()).days} days ago"
        ) if first_submitted else None,
        "unavailable": None,
    })

    escalations = WorkplanAlert.objects.filter(
        project_id__in=project_ids, status="active", alert_type__in=ESCALATION_TYPES,
    )
    items.append({
        "key": "escalations",
        "tone": "warn",
        "count": escalations.count(),
        "projects": escalations.values("project_id").distinct().count(),
        "detail": None,
        "unavailable": None,
    })

    suspended = [r["code"] for r in rows if r["stage"] == "LS017"]
    items.append({
        "key": "suspended",
        "tone": "warn",
        "count": len(suspended),
        "projects": len(suspended),
        "detail": ", ".join(c for c in suspended if c) or None,
        "unavailable": None,
    })
    items.append({
        "key": "country_suspensions",
        "tone": None,
        "count": None,
        "projects": None,
        "detail": None,
        "unavailable": NO_COUNTRY_SUSPENSION,
    })
    return items


def _watchlist(rows, projects_by_id, progress, project_ids, today):
    """Active and suspended projects, widest gap between clock and delivery first."""
    from apps.workplan.models import WorkplanAlert

    overdue = dict(
        ReportingPeriod.objects.filter(project_id__in=project_ids, status="overdue")
        .values("project_id").annotate(n=Count("pk")).values_list("project_id", "n")
    )
    escalated = dict(
        WorkplanAlert.objects.filter(
            project_id__in=project_ids, status="active", alert_type__in=ESCALATION_TYPES,
        )
        .values("project_id").annotate(n=Count("pk")).values_list("project_id", "n")
    )

    watched = []
    for r in rows:
        if r["stage"] not in ACTIVE_STAGES and r["stage"] != "LS017":
            continue
        time_pct = r["_time"]["elapsed_pct"]
        physical = progress.get(r["id"])
        flags = []
        if r["stage"] == "LS017":
            flags.append({"label": "Suspended", "tone": "bad"})
        if overdue.get(r["id"]):
            flags.append({"label": "Reporting overdue", "tone": "bad"})
        if escalated.get(r["id"]):
            flags.append({"label": "Escalated", "tone": "warn"})
        if r["end_date"] and r["end_date"] < today and r["stage"] in {"LS012", "LS013", "LS014"}:
            flags.append({"label": "Past end date", "tone": "warn"})

        dq = _data_quality_block(projects_by_id[r["id"]])
        watched.append({
            "id": r["id"],
            "code": r["code"],
            "name": r["name"],
            "hub": r["hub"],
            "stage": r["stage"],
            "stage_label": r["stage_label"],
            "bucket": r["bucket"],
            "time_elapsed_pct": time_pct,
            "physical_pct": physical,
            "gap_pct": round(time_pct - physical, 1) if time_pct is not None and physical is not None else None,
            "disbursed_pct": None,
            "dq_composite": dq["composite"],
            "overdue_periods": overdue.get(r["id"], 0),
            "escalations": escalated.get(r["id"], 0),
            "flags": flags,
        })

    watched.sort(key=lambda w: (
        w["gap_pct"] is None,
        -(w["gap_pct"] or 0),
        -len(w["flags"]),
    ))
    return watched[:WATCHLIST_SIZE]


def build_executive_summary(request):
    projects, filters = _filtered_projects(request)
    project_type = filters["type"]
    cycles = cycles_of_type(project_type)
    projects = list(projects)
    project_ids = [p.pk for p in projects]
    today = timezone.now().date()

    committed = {
        pid: _usd(total)
        for pid, total in (
            FinancingSource.objects.filter(envelope__project_id__in=project_ids)
            .values("envelope__project_id").annotate(t=Sum("amount_usd"))
            .values_list("envelope__project_id", "t")
        )
    }
    rows = _project_rows(projects, committed, today)
    progress = _progress_by_project(project_ids)

    return {
        "as_of": today,
        "filters": filters,
        "headline": _headline(rows, project_ids, cycles),
        "breakdowns": _breakdowns(rows, project_ids, project_type),
        "lifecycle": _lifecycle(rows, cycles),
        "milestones": _milestones(rows),
        "execution": _execution(rows, progress),
        "startup_chain": _startup_chain(rows),
        "results": _results(rows, project_ids, project_type),
        "attention": _attention(rows, project_ids, today),
        "watchlist": _watchlist(rows, {p.pk: p for p in projects}, progress, project_ids, today),
        "projects": [
            {k: v for k, v in r.items() if not k.startswith("_")}
            for r in rows
        ],
    }


class ExecutiveSummaryView(APIView):
    """GET /api/projects/executive-summary/ — the Executive Dashboard figures."""

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def get(self, request):
        return Response(build_executive_summary(request))

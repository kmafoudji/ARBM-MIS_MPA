"""Tier III fund performance — the operational indicators of the Fund itself.

Annex L lists 34 indicators in five sections. They are not project indicators:
none of them lives in the logframe, none is ever typed in. Each one is either
computed from the shared record or it does not exist yet.

**Thirteen of the thirty-four have a source in this database today.** The rest
are reported as unavailable, with the reason, rather than left blank or filled
with a plausible number: a fund dashboard that quietly shows 0% where it means
"we do not track this" is worse than one that says so.

What is missing, and why it cannot be computed:

- no disbursement is recorded anywhere in the schema — this alone removes
  3.6, 3.8, 3.9 (utilisation, disbursed amount, disbursement rate) and 4.3,
  4.4, both of which are anchored on the first disbursement;
- there is no communications data model at all — the whole of section 5;
- beneficiary *actuals* do not exist, and the two target fields on Project
  are not serialised anywhere — 2.4;
- nothing links a project or an indicator to an SdgTarget, only to an Sdg — 2.3;
- Country carries no income group and no LDC flag — 3.3;
- there is no TRC scoresheet, no PPIF record, no PCR object, and no baseline
  *capture date* (only a baseline value and year) — 1.2, 1.3, 1.4, 1.11;
- climate_marker offers the single placeholder choice "tbd", so it carries no
  signal — 1.7; and no field records whether a design was informed by a gender
  analysis — 1.6.

**No targets.** Annex L marks every Tier III baseline and target TBD, and the
schema has nowhere to put one. Every indicator below therefore reports a value
and no target, which means no RAG colour. When the codebook sets targets, they
get a home of their own and ``target`` starts coming back populated; nothing
here needs to change shape.

**No history.** These figures are computed live from the current state of the
record; no snapshot of them is stored. There is consequently no trend and no
sparkline — a quarter-on-quarter series would require snapshots that this
system does not take.

Scope: every count and every sum honours ``Project.objects.in_scope(request)``
and, through it, the hub chosen in the topbar — the same denominator as every
other portfolio figure.
"""
from datetime import date
from decimal import Decimal

from django.db.models import Count, Sum

from apps.project.models import (
    FinancingSource,
    Project,
    ProjectStageTransition,
    ReportingPeriod,
)
from apps.reference.models import Sdg
from .models import Indicator, ResultsData

# Sections in the order Annex L lists them. ``color`` names a palette token of
# the interface (docs/design.md), so the section keeps one colour everywhere it
# is shown without the frontend holding a translation table.
SECTIONS = [
    {"key": "quality",  "number": 1, "name": "Project quality & performance",         "color": "green"},
    {"key": "sdg",      "number": 2, "name": "SDG alignment & beneficiary reach",     "color": "blue"},
    {"key": "finance",  "number": 3, "name": "Portfolio finances",                    "color": "orange"},
    {"key": "pipeline", "number": 4, "name": "Pipeline & project lifecycle timelines", "color": "rose"},
    {"key": "comms",    "number": 5, "name": "Communications",                        "color": "violet"},
]

# Lifecycle codes the timeline indicators measure between (SF-4 stage machine).
STAGE_IC_ENDORSED = "LS006"
STAGE_EFFECTIVE = "LS012"
STAGE_CLOSED = "LS016"

# 1.1 — a project "meets its targets" when this share of its reported
# indicators reached theirs. The threshold is Annex L's own wording.
TARGETS_MET_THRESHOLD = Decimal("0.75")


def _available(code, name, value, unit="", note=""):
    """An indicator with a real value behind it."""
    return {
        "code": code,
        "name": name,
        "available": True,
        "value": value,
        "unit": unit,
        # No target anywhere in the schema yet: see the module docstring.
        "target": None,
        "note": note,
    }


def _missing(code, name, reason):
    """An indicator with nothing behind it. ``reason`` is shown to the user."""
    return {
        "code": code,
        "name": name,
        "available": False,
        "value": None,
        "unit": "",
        "target": None,
        "reason": reason,
    }


def _pct(part, whole):
    """Percentage rounded to one decimal, or None when there is no denominator."""
    if not whole:
        return None
    return round(part * 100 / whole, 1)


def _months(start, end):
    """Whole-ish months between two dates, as a float. None if either is missing."""
    if not start or not end:
        return None
    return round((end - start).days / 30.44, 1)


# ---------------------------------------------------------------------------
# 1 — Project quality & performance
# ---------------------------------------------------------------------------

def _section_quality(projects):
    project_ids = list(projects.values_list("pk", flat=True))

    # 1.1 — of the projects that reported at all, how many met more than 75%
    # of the targets they reported against, in their most recent period with
    # approved data. Projects that have reported nothing are outside the
    # denominator: they are silent, not failing.
    rows = (
        ResultsData.objects
        .filter(
            logframe_row__project_id__in=project_ids,
            status="approved",
            achievement_rate__isnull=False,
        )
        .values(
            "logframe_row__project_id",
            "reporting_period__period_number",
            "achievement_rate",
        )
    )
    latest_period = {}
    for row in rows:
        pid = row["logframe_row__project_id"]
        number = row["reporting_period__period_number"]
        if number > latest_period.get(pid, -1):
            latest_period[pid] = number
    met, reported = {}, {}
    for row in rows:
        pid = row["logframe_row__project_id"]
        if row["reporting_period__period_number"] != latest_period[pid]:
            continue
        reported[pid] = reported.get(pid, 0) + 1
        if row["achievement_rate"] >= 100:
            met[pid] = met.get(pid, 0) + 1
    passing = sum(
        1 for pid, total in reported.items()
        if Decimal(met.get(pid, 0)) / total > TARGETS_MET_THRESHOLD
    )

    # 1.5 — the WE categories that count as EWE (economic women's
    # empowerment) are WE001 and WE002; the others are weaker forms.
    total_projects = len(project_ids)
    ewe = projects.filter(we_category__in=("WE001", "WE002")).count()

    # 1.8 — every reporting period that has come and gone, across the
    # portfolio. is_late is derived from submitted_at vs due_date, so a period
    # still unsubmitted after its due date counts as late, not as missing.
    periods = ReportingPeriod.objects.filter(
        project_id__in=project_ids,
        due_date__lte=date.today(),
    )
    expected = periods.count()
    on_time = sum(1 for p in periods if p.status in ("submitted", "approved") and not p.is_late)

    return [
        _available(
            "1.1", "Projects meeting >75% of quarterly targets",
            _pct(passing, len(reported)), "%",
            note=(
                f"{passing} of {len(reported)} projects that reported. "
                "Each project's most recent period with approved data."
            ),
        ),
        _missing("1.2", "Average design quality rating (TRC)",
                 "TRC scoresheets are not recorded in the system."),
        _missing("1.3", "PPIF utilisation rate",
                 "Project preparation facility funding is not tracked."),
        _missing("1.4", "Baseline within 90 days of launch",
                 "Baselines carry a value and a year, but no capture date."),
        _available(
            "1.5", "Projects categorised EWE", _pct(ewe, total_projects), "%",
            note=f"{ewe} of {total_projects} projects in WE001 or WE002.",
        ),
        _missing("1.6", "Design informed by gender analysis",
                 "No field records whether a gender analysis informed the design."),
        _missing("1.7", "Design informed by climate analysis",
                 "The climate marker has one placeholder value and carries no signal yet."),
        _available(
            "1.8", "Expected reports received on time", _pct(on_time, expected), "%",
            note=f"{on_time} of {expected} reporting periods past their due date.",
        ),
        _missing("1.11", "PCRs submitted within 6 months",
                 "Project completion reports are not recorded in the system."),
    ]


# ---------------------------------------------------------------------------
# 2 — SDG alignment & beneficiary reach
# ---------------------------------------------------------------------------

def _section_sdg(projects):
    project_ids = list(projects.values_list("pk", flat=True))

    # 2.1 — the taxonomy is two-level (pillar → sector); there is no level
    # below sector, so this reports the largest sector, not sub-sector.
    by_sector = (
        projects.filter(primary_sector__isnull=False)
        .values("primary_sector__name")
        .annotate(n=Count("pk"))
        .order_by("-n")
    )
    largest = by_sector.first()

    # 2.2 — of the indicators actually used by these projects, how many carry
    # at least one SDG. The catalogue at large is not the denominator: an
    # indicator nobody uses tells us nothing about the portfolio.
    used = Indicator.objects.filter(
        logframe_rows__project_id__in=project_ids
    ).distinct()
    used_total = used.count()
    aligned = used.filter(related_sdgs__isnull=False).distinct().count()

    sdgs_covered = (
        Sdg.objects.filter(projects__pk__in=project_ids).distinct().count()
    )

    return [
        _available(
            "2.1", "Projects by sector (largest)",
            largest["n"] if largest else 0, f" of {len(project_ids)}",
            note=(
                f"Largest sector: {largest['primary_sector__name']}. "
                f"{by_sector.count()} sectors active. The taxonomy stops at "
                "sector — there is no sub-sector level."
                if largest else "No project carries a primary sector."
            ),
        ),
        _available(
            "2.2", "Project indicators aligned with SDGs",
            _pct(aligned, used_total), "%",
            note=(
                f"{aligned} of {used_total} indicators in use carry at least one "
                f"SDG. {sdgs_covered} SDGs are covered by at least one project."
            ),
        ),
        _missing("2.3", "SDG targets addressed",
                 "Projects and indicators link to an SDG, never to an SDG target."),
        _missing("2.4", "Beneficiaries reached (cumulative)",
                 "No beneficiary actuals are recorded; only targets exist, and they "
                 "are not exposed by the API."),
    ]


# ---------------------------------------------------------------------------
# 3 — Portfolio finances
# ---------------------------------------------------------------------------

def _section_finance(projects):
    project_ids = list(projects.values_list("pk", flat=True))
    sources = FinancingSource.objects.filter(
        envelope__project_id__in=project_ids
    )

    total = sources.aggregate(t=Sum("amount_usd"))["t"] or Decimal(0)
    grant = sources.filter(instrument="grant").aggregate(t=Sum("amount_usd"))["t"] or Decimal(0)
    ocr = sources.filter(source="isdb_oc").aggregate(t=Sum("amount_usd"))["t"] or Decimal(0)
    cofin = sources.filter(source="co_financing").aggregate(t=Sum("amount_usd"))["t"] or Decimal(0)

    by_sector = (
        sources.values("envelope__project__primary_sector__name")
        .annotate(t=Sum("amount_usd"))
        .order_by("-t")
    )
    largest = by_sector.first()

    billions = float(total) / 1_000_000_000 if total else 0

    return [
        _available(
            "3.1", "Total portfolio size", round(billions, 2), " bn USD",
            note=(
                f"Sum of every financing line across {sources.count()} entries. "
                "Commitments, not disbursements."
            ),
        ),
        _available(
            "3.2", "Financing to the largest sector",
            _pct(float(largest["t"]), float(total)) if largest and total else None, "%",
            note=(
                f"{largest['envelope__project__primary_sector__name']}."
                if largest and largest["envelope__project__primary_sector__name"]
                else "No financing line carries a sector."
            ),
        ),
        _missing("3.3", "Financing to LDCs",
                 "Countries carry no income group and no LDC flag."),
        _available(
            "3.4", "Grant share of financing",
            _pct(float(grant), float(total)) if total else None, "%",
            note="Financing lines with a grant instrument, over the total.",
        ),
        _missing("3.5", "Average grant element",
                 "Concessionality is not computed; loan terms are not recorded."),
        _missing("3.6", "Grant utilisation rate",
                 "No disbursement is recorded in the system."),
        _available(
            "3.7", "Leverage ratio (grant : OCR)",
            round(float(ocr) / float(grant), 2) if grant else None, "×",
            note="IsDB Ordinary Capital over LLF grant, on commitments.",
        ),
        _missing("3.8", "Disbursed amount",
                 "No disbursement is recorded in the system."),
        _missing("3.9", "Disbursement rate",
                 "No disbursement is recorded in the system."),
        _available(
            "3.10", "Co-financing ratio",
            _pct(float(cofin), float(total)) if total else None, "%",
            note="Financing lines from a co-financing source, over the total.",
        ),
    ]


# ---------------------------------------------------------------------------
# 4 — Pipeline & lifecycle timelines
# ---------------------------------------------------------------------------

def _stage_dates(project_ids):
    """First effective date each project entered each stage, keyed by project.

    transition_date is the date the stage actually changed, which may differ
    from when someone recorded it; a transition without one is unusable here
    and is skipped rather than falling back to the entry timestamp.
    """
    dates = {}
    transitions = (
        ProjectStageTransition.objects
        .filter(project_id__in=project_ids, transition_date__isnull=False)
        .values("project_id", "to_stage", "transition_date")
        .order_by("transition_date")
    )
    for t in transitions:
        per_project = dates.setdefault(t["project_id"], {})
        per_project.setdefault(t["to_stage"], t["transition_date"])
    return dates


def _average_gap(dates, from_stage, to_stage):
    """Average months between two stages, over the projects that reached both."""
    spans = []
    for stages in dates.values():
        gap = _months(stages.get(from_stage), stages.get(to_stage))
        if gap is not None and gap >= 0:
            spans.append(gap)
    if not spans:
        return None, 0
    return round(sum(spans) / len(spans), 1), len(spans)


def _section_pipeline(projects):
    project_ids = list(projects.values_list("pk", flat=True))
    dates = _stage_dates(project_ids)

    # 4.1 — the proposal is the project's own creation into Concept Note;
    # there is no separate proposal-received date.
    to_endorsement, n_41 = _average_gap(dates, "LS001", STAGE_IC_ENDORSED)
    to_effective, n_42 = _average_gap(dates, STAGE_IC_ENDORSED, STAGE_EFFECTIVE)
    lifecycle, n_45 = _average_gap(dates, STAGE_IC_ENDORSED, STAGE_CLOSED)

    def span_note(n, first, last):
        if not n:
            return f"No project has recorded both {first} and {last} with a date."
        return f"Average over the {n} project(s) that recorded both dates."

    return [
        _available(
            "4.1", "Concept Note → IC endorsement", to_endorsement, " months",
            note=span_note(n_41, "Concept Note", "IC endorsed"),
        ),
        _available(
            "4.2", "IC endorsement → effectiveness", to_effective, " months",
            note=span_note(n_42, "IC endorsed", "Effective"),
        ),
        _missing("4.3", "Effectiveness → first disbursement",
                 "No disbursement is recorded in the system."),
        _missing("4.4", "First disbursement → completion",
                 "No disbursement is recorded in the system."),
        _available(
            "4.5", "Lifecycle · endorsement → completion", lifecycle, " months",
            note=span_note(n_45, "IC endorsed", "Closed"),
        ),
    ]


# ---------------------------------------------------------------------------
# 5 — Communications
# ---------------------------------------------------------------------------

def _section_comms(projects):
    reason = "Communications activity is not recorded anywhere in the system."
    return [
        _missing("5.1", "Comms assets produced by projects", reason),
        _missing("5.2", "Beneficiaries interviewed for stories", reason),
        _missing("5.3", "Fund dashboard views", reason),
        _missing("5.4", "Media coverage with LLF mention", reason),
        _missing("5.5", "Social posts with @LLF mention", reason),
        _missing("5.6", "Communications events", reason),
    ]


# ---------------------------------------------------------------------------
# Breakdowns — the distributions behind the headline figures
# ---------------------------------------------------------------------------
# The analytics view needs shapes the scorecard does not: how the portfolio
# splits by sector, where the money sits, which SDGs are covered, how long each
# phase takes. Every one of these is **cross-sectional** — a cut of the current
# state. None is a time series, and that is not an omission: these figures are
# never snapshotted, so a quarter-on-quarter line could only be fabricated.

def _distribution(rows, label_key, value_key, fallback="Unclassified"):
    """Rows as label/value/share, largest first, shares summing over the total.

    A count stays an integer and an amount becomes a float: the interface shows
    the value as it comes, and "4.0 projects" would be wrong.
    """
    total = sum(float(r[value_key] or 0) for r in rows)
    out = []
    for row in rows:
        raw = row[value_key] or 0
        value = raw if isinstance(raw, int) else float(raw)
        out.append({
            "label": row[label_key] or fallback,
            "value": value,
            "share": round(float(value) * 100 / total, 1) if total else None,
        })
    return sorted(out, key=lambda r: r["value"], reverse=True)


def _breakdown_projects_by_sector(projects):
    rows = (
        projects.values("primary_sector__name")
        .annotate(n=Count("pk", distinct=True))
        .order_by("-n")
    )
    return _distribution(list(rows), "primary_sector__name", "n", "No sector")


def _breakdown_financing(project_ids):
    sources = FinancingSource.objects.filter(envelope__project_id__in=project_ids)

    by_sector = list(
        sources.values("envelope__project__primary_sector__name")
        .annotate(t=Sum("amount_usd"))
        .order_by("-t")
    )
    by_instrument = list(
        sources.values("instrument").annotate(t=Sum("amount_usd")).order_by("-t")
    )
    by_source = list(
        sources.values("source").annotate(t=Sum("amount_usd")).order_by("-t")
    )

    # The stored value is a code; the interface should show the label the
    # vocabulary defines, not "isdb_oc".
    instruments = dict(FinancingSource._meta.get_field("instrument").choices)
    sources_labels = dict(FinancingSource._meta.get_field("source").choices)
    for row in by_instrument:
        row["instrument"] = instruments.get(row["instrument"], row["instrument"])
    for row in by_source:
        row["source"] = sources_labels.get(row["source"], row["source"])

    return {
        "financing_by_sector": _distribution(
            by_sector, "envelope__project__primary_sector__name", "t", "No sector"
        ),
        "financing_by_instrument": _distribution(by_instrument, "instrument", "t"),
        "financing_by_source": _distribution(by_source, "source", "t"),
    }


def _breakdown_sdg_coverage(project_ids):
    """SDGs carried by at least one project, with the Fund's own colour for each."""
    rows = (
        Sdg.objects.filter(projects__pk__in=project_ids)
        .annotate(n=Count("projects", distinct=True))
        .order_by("-n", "number")
        .values("number", "name", "color", "n")
    )
    return [
        {
            "number": r["number"],
            "label": f"SDG {r['number']}",
            "name": r["name"],
            "color": r["color"] or None,
            "value": r["n"],
        }
        for r in rows
    ]


def _breakdown_lifecycle_phases(project_ids):
    """The funnel: months per phase, and how many projects each average rests on.

    The two phases anchored on a first disbursement are present and flagged
    unavailable rather than dropped — the gap between endorsement and
    implementation is the point of the chart, and a funnel silently missing two
    of its five steps would misstate the lifecycle it claims to show.
    """
    dates = _stage_dates(project_ids)
    spec = [
        ("4.1", "Concept Note → IC endorsement", "LS001", STAGE_IC_ENDORSED),
        ("4.2", "IC endorsement → effectiveness", STAGE_IC_ENDORSED, STAGE_EFFECTIVE),
        ("4.3", "Effectiveness → first disbursement", None, None),
        ("4.4", "First disbursement → completion", None, None),
        ("4.5", "Lifecycle · endorsement → completion", STAGE_IC_ENDORSED, STAGE_CLOSED),
    ]
    phases = []
    for code, label, start, end in spec:
        if start is None:
            phases.append({
                "code": code, "label": label, "available": False,
                "months": None, "projects": 0,
                "reason": "No disbursement is recorded in the system.",
            })
            continue
        months, n = _average_gap(dates, start, end)
        phases.append({
            "code": code, "label": label, "available": True,
            "months": months, "projects": n,
            # 4.5 spans the others; drawing it to the same scale would dwarf them.
            "is_total": code == "4.5",
        })
    return phases


def build_breakdowns(projects):
    project_ids = list(projects.values_list("pk", flat=True))
    return {
        "projects_by_sector": _breakdown_projects_by_sector(projects),
        **_breakdown_financing(project_ids),
        "sdg_coverage": _breakdown_sdg_coverage(project_ids),
        "lifecycle_phases": _breakdown_lifecycle_phases(project_ids),
    }


# ---------------------------------------------------------------------------

_BUILDERS = {
    "quality":  _section_quality,
    "sdg":      _section_sdg,
    "finance":  _section_finance,
    "pipeline": _section_pipeline,
    "comms":    _section_comms,
}


def build_fund_performance(request):
    """The five Annex L sections, computed within the requester's scope."""
    projects = Project.objects.in_scope(request)

    sections = []
    for section in SECTIONS:
        indicators = _BUILDERS[section["key"]](projects)
        sections.append({**section, "indicators": indicators})

    all_indicators = [i for s in sections for i in s["indicators"]]
    return {
        "sections": sections,
        "breakdowns": build_breakdowns(projects),
        "summary": {
            "projects_in_scope": projects.count(),
            "indicators_total": len(all_indicators),
            "indicators_available": sum(1 for i in all_indicators if i["available"]),
        },
    }

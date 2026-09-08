"""
Writing an ImportPlan to the database (design §4, §9).

This module validates nothing and decides nothing: it trusts the plan. Every
question — does this row exist, is this value acceptable, create or update —
has already been settled by `parser`. That is what guarantees a validation
report cannot lie about what a commit would do.

The whole sequence runs inside a single `transaction.atomic()` (D-2): the
database is shared and a half-loaded project is hard to repair in a
relational tree.
"""
from django.db import transaction

from apps.project.models import (
    FinancingSource,
    Project,
    ProjectCountry,
    ProjectFinancialEnvelope,
    ProjectGadmScope,
    ProjectImplementingPartner,
)
from apps.project.services import (
    generate_reporting_periods,
    generate_workspace,
)
from apps.reference.models import Currency, Donor, ImplementingAgency, Sdg
from apps.results.models import (
    Indicator,
    LogframeRow,
    LogframeTarget,
    ResultsData,
    TheoryOfChange,
    ToCNode,
)
from apps.results.services import create_toc_node
from apps.workplan.models import Activity, Milestone, WorkplanComponent, WorkplanSubComponent

from .plan import ACTION_CREATE, ACTION_DELETE, ACTION_REPLACE, ACTION_UNCHANGED, ACTION_UPDATE
from .parser import (
    SHEET_ACTIVITIES,
    SHEET_AGENCIES,
    SHEET_COMPONENTS,
    SHEET_DONORS,
    SHEET_ENVELOPE,
    SHEET_FINANCING,
    SHEET_GADM,
    SHEET_INDICATORS,
    SHEET_MILESTONES,
    SHEET_PARTNERS,
    SHEET_PERIODS,
    SHEET_PROJECT,
    SHEET_RESULTS,
    SHEET_TARGETS,
    SHEET_TOC,
    SHEET_WORKSPACE,
)

WRITES = (ACTION_CREATE, ACTION_UPDATE, ACTION_REPLACE)


class ApplyContext:
    """Objects written along the way, so later sheets can hang off them."""

    def __init__(self, plan, actor):
        self.plan = plan
        self.actor = actor
        self.project = None
        self.envelope = None
        self.agencies = {}  # workbook code -> ImplementingAgency
        self.indicators = {}  # code -> Indicator
        self.logframe_rows = {}  # indicator code -> LogframeRow
        self.toc_nodes = {}  # workbook node_ref -> ToCNode
        self.components = {}  # code -> WorkplanComponent
        self.sub_components = {}  # code -> WorkplanSubComponent
        self.activities = {}  # code -> Activity


@transaction.atomic
def apply(plan, actor=None):
    """
    Write the plan and return the Project it touched.

    Must only be called on a plan without errors; the endpoint sees to that.
    """
    context = ApplyContext(plan, actor)

    _apply_project(context)
    _apply_envelope(context)
    _apply_financing(context)
    _apply_donors(context)
    _apply_agencies(context)
    _apply_partners(context)
    _apply_indicators(context)
    _apply_toc(context)
    _apply_components(context)
    _apply_activities(context)
    _apply_milestones(context)
    _apply_gadm(context)
    _apply_reporting_periods(context)
    _apply_workspace(context)
    _apply_results(context)

    plan.committed = True
    plan.project_id = context.project.pk if context.project else None
    return context.project


# ---------------------------------------------------------------------------


def _apply_project(context):
    changes = context.plan.changes_for(SHEET_PROJECT)
    if not changes:
        raise ValueError("Plan without a project: nothing to write.")
    change = changes[0]
    payload = change.payload
    fields = payload.get("fields", {})

    if change.action == ACTION_CREATE:
        project = Project(official_reference_number=context.plan.project_ref, created_by=context.actor)
        for name, value in fields.items():
            setattr(project, name, value)
        project.save()
    else:
        project = Project.objects.get(official_reference_number=context.plan.project_ref)
        if change.action == ACTION_UPDATE:
            for name, value in fields.items():
                setattr(project, name, value)
            project.save()

    context.project = project

    lead_country_id = payload.get("lead_country_id")
    if lead_country_id:
        # One lead row per project (model constraint): clear the flag
        # elsewhere before setting it here.
        ProjectCountry.objects.filter(project=project, is_lead=True).exclude(
            country_id=lead_country_id
        ).update(is_lead=False)
        ProjectCountry.objects.update_or_create(
            project=project, country_id=lead_country_id, defaults={"is_lead": True},
        )

    for number in payload.get("sdgs", []):
        sdg = Sdg.objects.filter(number=number).first()
        if sdg is not None:
            project.sdgs.add(sdg)


def _apply_envelope(context):
    changes = context.plan.changes_for(SHEET_ENVELOPE)
    envelope, _ = ProjectFinancialEnvelope.objects.get_or_create(project=context.project)
    if changes and changes[0].action in WRITES:
        notes = changes[0].payload.get("notes", "")
        if notes:
            envelope.notes = notes
        envelope.updated_by = context.actor
        envelope.save()
    context.envelope = envelope


def _apply_financing(context):
    """
    Content sync, scoped to the project (D-8).

    Deletes exactly the primary keys the plan lists and creates exactly the
    rows it lists. Rows the plan called `unchanged` are not touched at all,
    which is what keeps `donor` and `exchange_rate_date` — fields the
    workbook has no column for — on rows that did not change.

    A workbook with no financing row plans nothing here, so an empty sheet
    means "not supplied" rather than "wipe this".
    """
    for change in context.plan.changes_for(SHEET_FINANCING, ACTION_DELETE):
        FinancingSource.objects.filter(pk=change.payload["existing_pk"]).delete()

    for change in context.plan.changes_for(SHEET_FINANCING, ACTION_CREATE):
        payload = change.payload
        currency = Currency.objects.get(code=payload["currency_code"])
        FinancingSource.objects.create(
            envelope=context.envelope,
            source=payload["source"],
            instrument=payload["instrument"],
            amount=payload["amount"],
            amount_usd=payload["amount_usd"],
            currency=currency,
            label=payload.get("label", ""),
            order=payload.get("order", 0),
        )


def _apply_donors(context):
    for change in context.plan.changes_for(SHEET_DONORS, ACTION_CREATE):
        payload = change.payload
        donor, _ = Donor.objects.get_or_create(
            code=payload["code"], defaults={"name": payload["name"]},
        )
        context.project.donors.add(donor)

    # Donors already in the reference table are attached to the project
    # without being modified (design §7: a project file does not rewrite the
    # global catalogue).
    for change in context.plan.changes_for(SHEET_DONORS, ACTION_UNCHANGED):
        donor = Donor.objects.filter(code__iexact=change.target).first()
        if donor is not None:
            context.project.donors.add(donor)


def _apply_agencies(context):
    for change in context.plan.changes_for(SHEET_AGENCIES, ACTION_CREATE):
        payload = change.payload
        agency, _ = ImplementingAgency.objects.get_or_create(
            code=payload["code"],
            defaults={
                "name": payload["name"],
                "agency_type": payload["agency_type"],
                "country_id": payload.get("country_id"),
            },
        )
        context.agencies[payload["code"]] = agency

    for change in context.plan.changes_for(SHEET_AGENCIES, ACTION_UNCHANGED):
        agency = ImplementingAgency.objects.filter(code__iexact=change.target).first()
        if agency is not None:
            context.agencies[change.target] = agency


def _apply_partners(context):
    for change in context.plan.changes_for(SHEET_PARTNERS):
        if change.action not in WRITES:
            continue
        payload = change.payload
        agency = context.agencies.get(payload["agency_code"])
        if agency is None:
            continue
        ProjectImplementingPartner.objects.update_or_create(
            project=context.project,
            agency=agency,
            defaults={"role": payload["role"], "order": payload.get("order", 0)},
        )


def _apply_indicators(context):
    """
    Sheets 07 and 08 are replayed in the order they were emitted: indicator,
    then logframe row, then target. Each object finds the previous one by its
    code, without anything having to exist beforehand.
    """
    changes = context.plan.changes_for(SHEET_INDICATORS) + context.plan.changes_for(SHEET_TARGETS)
    for change in changes:
        payload = change.payload
        kind = payload.get("kind")

        if kind == "indicator":
            indicator = Indicator.objects.filter(code=payload["code"]).first()
            if indicator is None:
                indicator = Indicator.objects.create(
                    code=payload["code"],
                    name=payload["name"],
                    sector_id=payload["sector_id"],
                    definition=payload.get("definition", ""),
                    unit=payload.get("unit", ""),
                    direction=payload["direction"],
                    chain_level=payload.get("chain_level", ""),
                    reporting_frequency=payload.get("reporting_frequency", ""),
                )
            context.indicators[payload["code"]] = indicator

        elif kind == "logframe_row":
            indicator = context.indicators.get(payload["indicator_code"])
            if indicator is None:
                continue
            row, created = LogframeRow.objects.get_or_create(
                project=context.project,
                indicator=indicator,
                defaults={**payload["fields"], "order": payload.get("order", 0)},
            )
            if not created and change.action == ACTION_UPDATE:
                for name, value in payload["fields"].items():
                    setattr(row, name, value)
                row.save()
            context.logframe_rows[payload["indicator_code"]] = row

        elif kind == "logframe_target":
            row = context.logframe_rows.get(payload["indicator_code"])
            if row is None:
                continue
            LogframeTarget.objects.update_or_create(
                logframe_row=row,
                target_date=payload["target_date"],
                defaults={
                    "target_value": payload["target_value"],
                    "is_original_pad": payload.get("is_original_pad", False),
                },
            )


def _apply_toc(context):
    """
    The Theory of Change, when the plan carries one (sheet 06 present and
    complete). Nodes are created bottom-up through `create_toc_node()`, the
    same path the ToC page uses, so the adjacency check and the codes are
    the model's own. Extra contributors become cross-pathways afterwards:
    the M2M needs both ends to exist.
    """
    changes = context.plan.changes_for(SHEET_TOC)
    if not any(c.action in WRITES or c.action == ACTION_DELETE for c in changes):
        return

    toc, _ = TheoryOfChange.objects.get_or_create(
        project=context.project, defaults={"created_by": context.actor}
    )

    for change in context.plan.changes_for(SHEET_TOC, ACTION_DELETE):
        ToCNode.objects.filter(pk=change.payload["existing_pk"], toc=toc).delete()

    for change in changes:
        if change.action not in WRITES:
            continue
        payload = change.payload
        if payload.get("kind") == "ultimate":
            toc.ultimate_outcome = payload["statement"]
            toc.save(update_fields=["ultimate_outcome", "updated_at"])
        elif payload.get("kind") == "node":
            parent = context.toc_nodes.get(payload["parent_ref"]) if payload.get("parent_ref") else None
            logframe_row = context.logframe_rows.get(payload.get("logframe_indicator"))
            node = create_toc_node(
                toc, payload["chain_level"], parent.pk if parent else None,
                statement=payload["statement"],
                assumptions=payload.get("assumptions", ""),
                logframe_row=logframe_row,
            )
            context.toc_nodes[payload["node_ref"]] = node

    for change in changes:
        payload = change.payload
        if change.action not in WRITES or payload.get("kind") != "node":
            continue
        target = context.toc_nodes.get(payload["node_ref"])
        for ref in payload.get("extra_contributors", []):
            contributor = context.toc_nodes.get(ref)
            if contributor is not None and target is not None:
                contributor.cross_pathways.add(target)


def _apply_components(context):
    for change in context.plan.changes_for(SHEET_COMPONENTS):
        payload = change.payload
        if payload.get("kind") != "component":
            continue
        component, created = WorkplanComponent.objects.get_or_create(
            project=context.project, code=payload["code"], defaults=payload["fields"],
        )
        if not created and change.action == ACTION_UPDATE:
            for name, value in payload["fields"].items():
                setattr(component, name, value)
            component.save()
        context.components[payload["code"]] = component

    for change in context.plan.changes_for(SHEET_COMPONENTS):
        payload = change.payload
        if payload.get("kind") != "sub_component":
            continue
        parent = context.components.get(payload["parent_code"])
        if parent is None:
            continue
        sub, created = WorkplanSubComponent.objects.get_or_create(
            component=parent, code=payload["code"], defaults=payload["fields"],
        )
        if not created and change.action == ACTION_UPDATE:
            for name, value in payload["fields"].items():
                setattr(sub, name, value)
            sub.save()
        context.sub_components[payload["code"]] = sub


def _apply_activities(context):
    for change in context.plan.changes_for(SHEET_ACTIVITIES):
        if change.action not in WRITES:
            # An unchanged activity still has to be known: a milestone may
            # hang off it.
            payload = change.payload
            sub = context.sub_components.get(payload.get("sub_component_code"))
            if sub is not None:
                existing = Activity.objects.filter(sub_component=sub, code=payload["code"]).first()
                if existing is not None:
                    context.activities[payload["code"]] = existing
            continue

        payload = change.payload
        sub = context.sub_components.get(payload["sub_component_code"])
        if sub is None:
            continue
        activity, created = Activity.objects.get_or_create(
            sub_component=sub,
            code=payload["code"],
            defaults={
                **payload["fields"],
                "order": payload.get("order", 0),
                "created_by": context.actor,
            },
        )
        if not created and change.action == ACTION_UPDATE:
            for name, value in payload["fields"].items():
                setattr(activity, name, value)
            activity.save()
        context.activities[payload["code"]] = activity


def _apply_milestones(context):
    """
    Content sync, scoped to the project (D-8). As with financing, rows the
    plan called `unchanged` are left alone — which is what keeps `is_gate`,
    the evidence fields, and any WorkplanAlert hanging off them.
    """
    for change in context.plan.changes_for(SHEET_MILESTONES, ACTION_DELETE):
        Milestone.objects.filter(pk=change.payload["existing_pk"]).delete()

    changes = context.plan.changes_for(SHEET_MILESTONES, ACTION_CREATE)
    if not changes:
        return

    placeholder = _placeholder_activity(context)
    for change in changes:
        payload = change.payload
        activity = context.activities.get(payload.get("activity_code")) or placeholder
        if activity is None:
            continue
        Milestone.objects.create(
            activity=activity,
            name=payload["name"],
            category=payload["category"],
            planned_date=payload["planned_date"],
            actual_date=payload.get("actual_date"),
            status=payload["status"],
            order=payload.get("order", 0),
        )


def _placeholder_activity(context):
    """The activity carrying activity-less milestones (D-10), if the plan declares one."""
    from .parser import PLACEHOLDER_ACTIVITY_SUFFIX

    for code, activity in context.activities.items():
        if code.endswith(PLACEHOLDER_ACTIVITY_SUFFIX):
            return activity
    return None


def _apply_gadm(context):
    for change in context.plan.changes_for(SHEET_GADM):
        if change.action not in WRITES:
            continue
        payload = change.payload
        ProjectGadmScope.objects.update_or_create(
            project=context.project,
            area_id=payload["area_id"],
            defaults={
                "is_primary": payload.get("is_primary", False),
                "notes": payload.get("notes", ""),
            },
        )


def _apply_reporting_periods(context):
    changes = context.plan.changes_for(SHEET_PERIODS)
    if not changes or changes[0].action not in WRITES:
        return
    # Idempotent: creates only the missing periods, none beyond end_date.
    generate_reporting_periods(context.project)


def _apply_workspace(context):
    """
    Activate the workspace the imported stage implies (SF-10).

    Idempotent, and it does the rest of what Effective means: locks the ToC
    and sets the module-ready flags. Without it the Workplan and Results tabs
    stay locked and everything this import loaded is unreachable from the
    interface.
    """
    changes = context.plan.changes_for(SHEET_WORKSPACE)
    if not changes or changes[0].action not in WRITES:
        return
    generate_workspace(context.project, context.actor)


def _apply_results(context):
    for change in context.plan.changes_for(SHEET_RESULTS):
        if change.action not in WRITES:
            continue
        payload = change.payload
        row = context.logframe_rows.get(payload["indicator_code"])
        if row is None:
            continue
        entry, _ = ResultsData.objects.update_or_create(
            logframe_row=row,
            reporting_period_id=payload["period_id"],
            defaults=payload["fields"],
        )
        entry.compute_and_save_rag()

"""Tests API — executive portfolio summary.

As with the Tier III dashboard and the project overview, this endpoint is
tested as much for what it refuses to invent as for what it computes. The
mockup it serves draws disbursement, contracts, procurement, regions and
grant-eligibility tiers; the schema has a source for none of them. The tests
pin that those come back unavailable with a reason, never as zeros, and pin
the arithmetic, the filters and the scope of what is computed.
"""
from datetime import date, timedelta

import pytest
from rest_framework.test import APIClient

from apps.project.models import (
    FinancingSource,
    ProjectStageTransition,
    ReportingPeriod,
)
from tests.factories import (
    CurrencyFactory,
    ProjectFactory,
    ProjectFinancialEnvelopeFactory,
    SectorFactory,
    UserFactory,
)

URL = "/api/projects/executive-summary/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def fund(project, usd, source="isdb_oc", instrument="loan"):
    envelope = ProjectFinancialEnvelopeFactory(project=project)
    FinancingSource.objects.create(
        envelope=envelope, source=source, instrument=instrument,
        amount=usd, currency=CurrencyFactory(), amount_usd=usd,
    )


def enter(project, stage, when):
    ProjectStageTransition.objects.create(
        project=project, from_stage="LS001", to_stage=stage, transition_date=when,
    )


@pytest.mark.django_db
class TestAbsencesAreDeclared:

    def test_disbursement_is_null_with_a_reason(self, auth_client):
        fund(ProjectFactory(), 1_000_000)
        data = auth_client.get(URL).data
        assert data["headline"]["disbursed_usd"] is None
        assert data["headline"]["disbursed_pct"] is None
        assert "disbursement" in data["headline"]["disbursed_unavailable"].lower()
        assert data["execution"]["financial_pct"] is None
        assert data["execution"]["financial_unavailable"]

    @pytest.mark.parametrize("block", [
        "by_region", "by_grant_tier", "disbursement", "contracts", "procurement",
        "expected_bed", "trc_delta",
    ])
    def test_blocks_without_a_source_carry_only_a_reason(self, auth_client, block):
        ProjectFactory()
        data = auth_client.get(URL).data["breakdowns"][block]
        assert set(data) == {"unavailable"}
        assert data["unavailable"]

    def test_the_startup_chain_ends_on_an_unavailable_first_disbursement(self, auth_client):
        chain = auth_client.get(URL).data["startup_chain"]
        assert chain["steps"][-1]["label"] == "First disbursement"
        assert chain["steps"][-1]["unavailable"]
        assert chain["gaps"][-1]["months"] is None

    def test_country_suspensions_are_declared_untracked(self, auth_client):
        items = {i["key"]: i for i in auth_client.get(URL).data["attention"]}
        assert items["country_suspensions"]["count"] is None
        assert items["country_suspensions"]["unavailable"]

    def test_an_empty_portfolio_answers_with_no_invented_figures(self, auth_client):
        resp = auth_client.get(URL)
        assert resp.status_code == 200
        assert resp.data["headline"]["projects"] == 0
        assert resp.data["headline"]["portfolio_usd"] is None
        assert resp.data["execution"]["time_elapsed_pct"] is None
        assert resp.data["execution"]["physical_pct"] is None
        assert resp.data["breakdowns"]["by_pipeline_year"]["unavailable"]


@pytest.mark.django_db
class TestHeadline:

    def test_commitments_grant_share_and_leverage(self, auth_client):
        project = ProjectFactory(investment_cycle="LLF2")
        fund(project, 750_000, source="isdb_oc", instrument="loan")
        fund(project, 250_000, source="llf", instrument="grant")
        headline = auth_client.get(URL).data["headline"]
        assert headline["portfolio_usd"] == 1_000_000
        assert headline["grant_usd"] == 250_000
        assert headline["grant_share_pct"] == 25.0
        assert headline["ocr_per_grant"] == 3.0

    def test_projects_are_split_by_cycle_with_the_unassigned_counted(self, auth_client):
        ProjectFactory(investment_cycle="LLF1")
        ProjectFactory(investment_cycle="LLF2")
        ProjectFactory(investment_cycle=None)
        by_cycle = {c["label"]: c["count"] for c in auth_client.get(URL).data["headline"]["projects_by_cycle"]}
        assert by_cycle == {"LLF1": 1, "LLF2": 1, "No cycle": 1}

    def test_a_project_without_financing_is_counted_not_zeroed(self, auth_client):
        ProjectFactory()
        data = auth_client.get(URL).data
        assert data["headline"]["projects_without_financing"] == 1
        assert data["projects"][0]["committed_usd"] is None
        assert data["breakdowns"]["by_project"] == []

    def test_a_group_of_unfunded_projects_has_no_amount(self, auth_client):
        """A sector whose projects carry no financing line is not a 0 USD slice."""
        health, agri = SectorFactory(), SectorFactory()
        ProjectFactory(primary_sector=health)
        fund(ProjectFactory(primary_sector=agri), 1_000_000)
        by_sector = {r["label"]: r for r in auth_client.get(URL).data["breakdowns"]["by_sector"]}
        assert by_sector[health.name]["value"] is None
        assert by_sector[health.name]["share"] is None
        assert by_sector[health.name]["count"] == 1
        assert by_sector[agri.name]["share"] == 100.0


@pytest.mark.django_db
class TestPipelineYear:

    def test_the_year_of_the_dated_ic_endorsement(self, auth_client):
        endorsed = ProjectFactory()
        fund(endorsed, 2_000_000)
        enter(endorsed, "LS006", date(2019, 5, 1))
        ProjectFactory()  # never endorsed with a date

        data = auth_client.get(URL).data["breakdowns"]["by_pipeline_year"]
        assert [(r["label"], r["value"], r["count"]) for r in data["rows"]] == [("2019", 2_000_000, 1)]
        assert data["projects_without_year"] == 1
        assert data["unavailable"] is None

    def test_an_undated_transition_gives_no_year(self, auth_client):
        project = ProjectFactory()
        ProjectStageTransition.objects.create(project=project, from_stage="LS005", to_stage="LS006")
        data = auth_client.get(URL).data["breakdowns"]["by_pipeline_year"]
        assert data["rows"] == []
        assert data["projects_without_year"] == 1


@pytest.mark.django_db
class TestLifecycle:

    def test_buckets_count_projects_and_name_no_gate(self, auth_client):
        ProjectFactory(lifecycle_stage="LS005")
        ProjectFactory(lifecycle_stage="LS013")
        ProjectFactory(lifecycle_stage="LS014", investment_cycle="LLF1")
        buckets = {b["key"]: b for b in auth_client.get(URL).data["lifecycle"]}
        assert buckets["preparation"]["count"] == 1
        assert buckets["implementing"]["count"] == 2
        assert buckets["implementing"]["by_cycle"] == {"LLF1": 1, "LLF2": 0, "none": 1}
        labels = " ".join(b["label"] for b in buckets.values()).lower()
        assert "gate" not in labels

    def test_appraisal_is_a_pre_approval_stage(self, auth_client):
        """Appraisal precedes board approval in the September 2026 order."""
        buckets = {b["key"]: b for b in auth_client.get(URL).data["lifecycle"]}
        assert buckets["appraisal"]["phase"] == "pre_approval"
        assert buckets["board"]["phase"] == "pre_approval"


@pytest.mark.django_db
class TestMilestones:
    """The deck's seven milestones, read off the stage each project is in."""

    def test_every_stage_belongs_to_exactly_one_milestone(self):
        from apps.project.models import LIFECYCLE_STAGE_CHOICES
        from apps.project.executive import DECK_MILESTONES

        covered = [code for _k, _l, codes in DECK_MILESTONES for code in codes]
        assert sorted(covered) == sorted(code for code, _label in LIFECYCLE_STAGE_CHOICES)
        assert len(covered) == len(set(covered))

    def test_a_project_sits_at_the_milestone_of_its_stage(self, auth_client):
        appraised = ProjectFactory(lifecycle_stage="LS009")
        fund(appraised, 2_000_000)
        fund(ProjectFactory(lifecycle_stage="LS008"), 1_000_000)
        ProjectFactory(lifecycle_stage="LS013")

        milestones = {m["key"]: m for m in auth_client.get(URL).data["milestones"]}
        assert milestones["m2"]["count"] == 2
        assert milestones["m2"]["value"] == 3_000_000
        assert milestones["m6"]["count"] == 1
        assert {p["id"] for p in milestones["m2"]["projects"]} >= {appraised.pk}

    def test_each_milestone_names_the_stages_it_covers(self, auth_client):
        milestones = {m["key"]: m for m in auth_client.get(URL).data["milestones"]}
        assert [s["code"] for s in milestones["m3"]["stages"]] == ["LS010"]
        assert milestones["m3"]["stages"][0]["label"] == "BED Approved"

    def test_an_unfunded_milestone_has_no_amount(self, auth_client):
        ProjectFactory(lifecycle_stage="LS001")
        milestones = {m["key"]: m for m in auth_client.get(URL).data["milestones"]}
        assert milestones["m0"]["count"] == 1
        assert milestones["m0"]["value"] is None

    def test_suspended_projects_leave_the_chain(self, auth_client):
        ProjectFactory(lifecycle_stage="LS017")
        milestones = {m["key"]: m for m in auth_client.get(URL).data["milestones"]}
        assert milestones["exception"]["count"] == 1
        assert sum(m["count"] for m in milestones.values() if m["key"] != "exception") == 0


@pytest.mark.django_db
class TestExecution:

    def test_time_and_physical_average_over_active_projects_only(self, auth_client):
        today = date.today()
        active = _project_with_activities([20, 40], lifecycle_stage="LS013")
        active.start_date = today - timedelta(days=500)
        active.end_date = today + timedelta(days=500)
        active.save()
        # Pre-approval: its dates and workplan must not enter the averages.
        _project_with_activities([100], lifecycle_stage="LS008")

        execution = auth_client.get(URL).data["execution"]
        assert execution["active_projects"] == 1
        assert execution["time_elapsed_pct"] == 50.0
        assert execution["physical_pct"] == 30.0
        assert execution["physical_method"] == "simple_average"

    def test_watchlist_ranks_the_widest_gap_first(self, auth_client):
        today = date.today()
        behind = _project_with_activities([10], lifecycle_stage="LS013")
        close = _project_with_activities([45], lifecycle_stage="LS013")
        for project in (behind, close):
            project.start_date = today - timedelta(days=500)
            project.end_date = today + timedelta(days=500)
            project.save()

        watchlist = auth_client.get(URL).data["watchlist"]
        assert [w["id"] for w in watchlist] == [behind.pk, close.pk]
        assert watchlist[0]["gap_pct"] == 40.0
        assert watchlist[0]["disbursed_pct"] is None

    def test_watchlist_flags_overdue_reporting_and_suspension(self, auth_client):
        today = date.today()
        suspended = ProjectFactory(lifecycle_stage="LS017")
        ReportingPeriod.objects.create(
            project=suspended, period_number=1,
            start_date=today - timedelta(days=120), end_date=today - timedelta(days=30),
            due_date=today - timedelta(days=12), label="Q1", status="overdue",
        )
        watchlist = auth_client.get(URL).data["watchlist"]
        assert [f["label"] for f in watchlist[0]["flags"]] == ["Suspended", "Reporting overdue"]

        items = {i["key"]: i for i in auth_client.get(URL).data["attention"]}
        assert items["overdue_reporting"]["count"] == 1
        assert "12 days" in items["overdue_reporting"]["detail"]
        assert items["suspended"]["count"] == 1


@pytest.mark.django_db
class TestStartupChain:

    def test_average_months_between_dated_stages(self, auth_client):
        for signed, effective in ((date(2021, 1, 1), date(2021, 7, 2)), (date(2022, 1, 1), date(2022, 3, 3))):
            project = ProjectFactory()
            enter(project, "LS011", signed)
            enter(project, "LS012", effective)

        chain = auth_client.get(URL).data["startup_chain"]
        signature_to_effective = chain["gaps"][2]
        assert signature_to_effective["projects"] == 2
        assert signature_to_effective["months"] == 4.0
        assert [c["year"] for c in chain["signature_to_effective_by_year"]] == [2021, 2022]


@pytest.mark.django_db
class TestFilters:

    def test_cycle_filter(self, auth_client):
        ProjectFactory(investment_cycle="LLF1")
        ProjectFactory(investment_cycle="LLF2")
        ProjectFactory(investment_cycle=None)
        assert auth_client.get(URL, {"cycle": "LLF2"}).data["headline"]["projects"] == 1
        assert auth_client.get(URL, {"cycle": "none"}).data["headline"]["projects"] == 1

    def test_a_pillar_takes_its_sectors(self, auth_client):
        pillar = SectorFactory()
        ProjectFactory(primary_sector=SectorFactory(parent=pillar))
        ProjectFactory(primary_sector=pillar)
        ProjectFactory()
        assert auth_client.get(URL, {"sector": pillar.pk}).data["headline"]["projects"] == 2

    @pytest.mark.parametrize("params", [{"cycle": "LLF9"}, {"sector": "health"}])
    def test_bad_filter_values_are_refused(self, auth_client, params):
        assert auth_client.get(URL, params).status_code == 400


@pytest.mark.django_db
class TestScope:

    def test_anonymous_is_refused(self):
        assert APIClient().get(URL).status_code in (401, 403)

    def test_a_user_with_no_role_sees_an_empty_denominator(self):
        fund(ProjectFactory(), 1_000_000)
        client = APIClient()
        client.force_authenticate(user=UserFactory(is_superuser=False))
        data = client.get(URL).data
        assert data["headline"]["projects"] == 0
        assert data["headline"]["portfolio_usd"] is None
        assert data["projects"] == []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _project_with_activities(progresses, **project_fields):
    from apps.workplan.models import Activity, WorkplanComponent, WorkplanSubComponent

    today = date.today()
    project = ProjectFactory(**project_fields)
    component = WorkplanComponent.objects.create(project=project, code="C1", name="Component 1")
    sub = WorkplanSubComponent.objects.create(component=component, code="C1.1", name="Sub-component 1")
    for index, progress in enumerate(progresses, start=1):
        Activity.objects.create(
            sub_component=sub, code=f"A{index}", name=f"Activity {index}",
            planned_start=today - timedelta(days=200),
            planned_end=today + timedelta(days=200),
            progress=progress,
        )
    return project

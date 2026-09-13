"""Tests API — project overview summary.

Like the Tier III dashboard, the point of this endpoint is as much what it
refuses to invent as what it computes. The mockup this serves asks for a
financial execution rate, a procurement exposure and a top risk; none of the
three has a source in the schema. The tests below pin that those come back
`None` with a reason rather than as a zero, and pin the arithmetic of the
blocks that do have a source.
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
    UserFactory,
)


def url_for(project):
    return f"/api/projects/{project.pk}/overview-summary/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


@pytest.mark.django_db
class TestAbsencesAreDeclared:
    """The three blocks with nothing behind them must say so, not show a zero."""

    def test_disbursement_is_null_with_a_reason(self, auth_client):
        project = ProjectFactory()
        data = auth_client.get(url_for(project)).data["financial"]
        assert data["disbursed_usd"] is None
        assert data["disbursed_pct"] is None
        assert "disbursement" in data["disbursed_unavailable"].lower()

    def test_commitments_do_not_leak_into_disbursement(self, auth_client):
        """An envelope with money in it is still 0% executed as far as we know."""
        envelope = ProjectFinancialEnvelopeFactory()
        FinancingSource.objects.create(
            envelope=envelope, source="isdb_oc", instrument="loan",
            amount=1_000_000, currency=CurrencyFactory(), amount_usd=1_000_000,
        )
        data = auth_client.get(url_for(envelope.project)).data["financial"]
        assert data["committed_usd"] == "1000000.00"
        assert data["disbursed_pct"] is None

    def test_risk_register_is_declared_missing(self, auth_client):
        project = ProjectFactory()
        data = auth_client.get(url_for(project)).data["escalations"]
        assert data["risk_register_unavailable"]
        assert data["active_count"] == 0

    def test_startup_chain_stops_before_the_first_disbursement(self, auth_client):
        project = ProjectFactory()
        chain = auth_client.get(url_for(project)).data["startup_chain"]
        last = chain["steps"][-1]
        assert last["label"] == "First disbursement"
        assert last["date"] is None
        assert last["unavailable"]

    def test_startup_chain_names_stages_not_gates(self, auth_client):
        """decisions/0012 keeps approval gates out of the interface."""
        project = ProjectFactory()
        chain = auth_client.get(url_for(project)).data["startup_chain"]
        labels = " ".join(s["label"] for s in chain["steps"]).lower()
        assert "gate" not in labels
        assert "bed" not in labels


@pytest.mark.django_db
class TestEmptyProject:
    """A project with nothing attached answers 200 and says what is missing."""

    def test_every_block_is_present_and_declares_its_gap(self, auth_client):
        project = ProjectFactory()
        resp = auth_client.get(url_for(project))
        assert resp.status_code == 200
        assert set(resp.data) == {
            "time", "physical", "financial", "reporting",
            "indicators", "data_quality", "startup_chain", "escalations",
        }
        assert resp.data["time"]["elapsed_unavailable"]
        assert resp.data["physical"]["progress_unavailable"]
        assert resp.data["reporting"]["reporting_unavailable"]
        assert resp.data["indicators"]["indicators_unavailable"]
        assert resp.data["data_quality"]["dq_unavailable"]

    def test_no_workplan_means_no_progress_not_zero_progress(self, auth_client):
        project = ProjectFactory()
        physical = auth_client.get(url_for(project)).data["physical"]
        assert physical["progress_pct"] is None
        assert physical["activities_total"] == 0


@pytest.mark.django_db
class TestTimeElapsed:

    def test_halfway_through_the_period(self, auth_client):
        today = date.today()
        project = ProjectFactory(
            start_date=today - timedelta(days=500),
            end_date=today + timedelta(days=500),
        )
        time = auth_client.get(url_for(project)).data["time"]
        assert time["elapsed_pct"] == 50.0
        assert time["elapsed_unavailable"] is None

    def test_never_reports_more_than_a_hundred_percent(self, auth_client):
        today = date.today()
        project = ProjectFactory(
            start_date=today - timedelta(days=800),
            end_date=today - timedelta(days=100),
        )
        time = auth_client.get(url_for(project)).data["time"]
        assert time["elapsed_pct"] == 100.0
        assert time["months_left"] == 0


@pytest.mark.django_db
class TestPhysicalProgress:

    def test_method_says_the_average_is_unweighted(self, auth_client):
        """Milestone carries no weight; the label must not claim one."""
        project = _project_with_activities([40, 60])
        physical = auth_client.get(url_for(project)).data["physical"]
        assert physical["progress_pct"] == 50.0
        assert physical["method"] == "simple_average"

    def test_overdue_counts_the_revised_date_when_there_is_one(self, auth_client):
        today = date.today()
        project = _project_with_activities([0])
        activity = _activities_of(project)[0]
        activity.planned_end = today - timedelta(days=30)
        activity.revised_end = today + timedelta(days=30)
        activity.save()
        physical = auth_client.get(url_for(project)).data["physical"]
        assert physical["activities_overdue"] == 0

    def test_most_overdue_is_ordered_by_the_effective_end_date(self, auth_client):
        """An unrevised activity must not sort last just because revised_end is NULL."""
        today = date.today()
        project = _project_with_activities([0, 0])
        first, second = _activities_of(project)
        first.planned_end = today - timedelta(days=90)   # no revision
        first.save()
        second.planned_end = today - timedelta(days=100)
        second.revised_end = today - timedelta(days=10)  # revised, less late
        second.save()
        physical = auth_client.get(url_for(project)).data["physical"]
        assert [a["days_overdue"] for a in physical["most_overdue"]] == [90, 10]


@pytest.mark.django_db
class TestReporting:

    def test_next_cut_off_is_the_first_due_date_still_ahead(self, auth_client):
        today = date.today()
        project = ProjectFactory()
        for number, offset in ((1, -30), (2, 19), (3, 110)):
            ReportingPeriod.objects.create(
                project=project, period_number=number,
                start_date=today - timedelta(days=offset + 90),
                end_date=today + timedelta(days=offset - 5),
                due_date=today + timedelta(days=offset),
                label=f"Q{number}", status="open",
            )
        reporting = auth_client.get(url_for(project)).data["reporting"]
        assert reporting["days_to_cutoff"] == 19
        assert reporting["next_label"] == "Q2"


@pytest.mark.django_db
class TestStartupChain:

    def test_gaps_are_measured_in_whole_months(self, auth_client):
        project = ProjectFactory()
        for to_stage, when in (
            ("LS010", date(2022, 2, 10)),
            ("LS011", date(2022, 4, 10)),
            ("LS012", date(2022, 6, 10)),
        ):
            ProjectStageTransition.objects.create(
                project=project, from_stage="LS001", to_stage=to_stage,
                transition_date=when,
            )
        chain = auth_client.get(url_for(project)).data["startup_chain"]
        assert [s["date"] for s in chain["steps"][:3]] == [
            date(2022, 2, 10), date(2022, 4, 10), date(2022, 6, 10),
        ]
        # The last gap runs into the first disbursement, which has no date.
        assert chain["gaps_months"] == [2, 2, None]

    def test_a_second_passage_does_not_move_the_chain(self, auth_client):
        """A rollback and a re-entry keep the original date."""
        project = ProjectFactory()
        for when in (date(2022, 4, 10), date(2023, 4, 10)):
            ProjectStageTransition.objects.create(
                project=project, from_stage="LS010", to_stage="LS011",
                transition_date=when,
            )
        chain = auth_client.get(url_for(project)).data["startup_chain"]
        assert chain["steps"][1]["date"] == date(2022, 4, 10)


@pytest.mark.django_db
class TestScope:

    def test_anonymous_is_refused(self):
        project = ProjectFactory()
        assert APIClient().get(url_for(project)).status_code in (401, 403)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _project_with_activities(progresses):
    """A project carrying one component, one sub-component and N activities."""
    from apps.workplan.models import Activity, WorkplanComponent, WorkplanSubComponent

    today = date.today()
    project = ProjectFactory()
    component = WorkplanComponent.objects.create(
        project=project, code="C1", name="Component 1",
    )
    sub = WorkplanSubComponent.objects.create(
        component=component, code="C1.1", name="Sub-component 1",
    )
    for index, progress in enumerate(progresses, start=1):
        Activity.objects.create(
            sub_component=sub, code=f"A{index}", name=f"Activity {index}",
            planned_start=today - timedelta(days=200),
            planned_end=today + timedelta(days=200),
            progress=progress,
        )
    return project


def _activities_of(project):
    from apps.workplan.models import Activity

    return list(
        Activity.objects.filter(
            sub_component__component__project=project
        ).order_by("code")
    )

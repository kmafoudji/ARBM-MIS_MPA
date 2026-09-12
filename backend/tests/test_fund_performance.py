"""
Tests API — Tier III fund performance (Annex L).

The point of this endpoint is what it refuses to invent. Most of these tests
pin the *absences*: an indicator with no source in the schema must come back
`available: false` with a reason, and must never be dressed up as a zero — a
dashboard reading "0% disbursed" when it means "we do not track disbursement"
is the failure mode worth a test.

The rest pin the arithmetic of the thirteen indicators that do have a source,
and that the whole thing stays inside the requester's scope.
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

URL = "/api/results/fund-performance/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def indicators_of(payload):
    """Every indicator across the five sections, keyed by Annex L code."""
    return {
        i["code"]: i
        for section in payload["sections"]
        for i in section["indicators"]
    }


@pytest.mark.django_db
class TestShape:

    def test_five_sections_in_annex_l_order(self, auth_client):
        resp = auth_client.get(URL)
        assert resp.status_code == 200
        numbers = [s["number"] for s in resp.data["sections"]]
        assert numbers == [1, 2, 3, 4, 5]

    def test_every_indicator_declares_availability(self, auth_client):
        resp = auth_client.get(URL)
        for code, ind in indicators_of(resp.data).items():
            assert isinstance(ind["available"], bool), code
            # An unavailable indicator owes the user a reason.
            if not ind["available"]:
                assert ind["reason"], code
                assert ind["value"] is None, code

    def test_no_indicator_carries_a_target_yet(self, auth_client):
        """Annex L marks every Tier III target TBD and the schema has no home
        for one. A target appearing here would be an invented number."""
        resp = auth_client.get(URL)
        assert all(i["target"] is None for i in indicators_of(resp.data).values())

    def test_anonymous_is_refused(self):
        assert APIClient().get(URL).status_code in (401, 403)


@pytest.mark.django_db
class TestAbsencesAreDeclared:
    """The 21 indicators with nothing behind them must say so."""

    @pytest.mark.parametrize("code", ["3.6", "3.8", "3.9", "4.3", "4.4"])
    def test_disbursement_indicators_are_unavailable(self, auth_client, code):
        ind = indicators_of(auth_client.get(URL).data)[code]
        assert ind["available"] is False
        assert "disbursement" in ind["reason"].lower()

    @pytest.mark.parametrize("code", ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"])
    def test_whole_communications_section_is_unavailable(self, auth_client, code):
        assert indicators_of(auth_client.get(URL).data)[code]["available"] is False

    @pytest.mark.parametrize("code", ["1.2", "1.3", "1.4", "1.6", "1.7", "1.11",
                                      "2.3", "2.4", "3.3", "3.5"])
    def test_unmodelled_indicators_are_unavailable(self, auth_client, code):
        assert indicators_of(auth_client.get(URL).data)[code]["available"] is False

    def test_an_empty_portfolio_reports_no_false_zeroes(self, auth_client):
        """With no projects at all, a computable indicator reports no value —
        not 0%, which would read as a real measurement of failure."""
        ind = indicators_of(auth_client.get(URL).data)["1.5"]
        assert ind["available"] is True
        assert ind["value"] is None


@pytest.mark.django_db
class TestQualitySection:

    def test_ewe_share_counts_we001_and_we002(self, auth_client):
        ProjectFactory(we_category="WE001")
        ProjectFactory(we_category="WE002")
        ProjectFactory(we_category="WE005")
        ProjectFactory(we_category=None)

        ind = indicators_of(auth_client.get(URL).data)["1.5"]
        assert ind["value"] == 50.0  # 2 of 4

    def test_reports_on_time_ignores_periods_not_yet_due(self, auth_client):
        project = ProjectFactory()
        today = date.today()
        # Due and submitted before the deadline.
        ReportingPeriod.objects.create(
            project=project, period_number=1,
            start_date=today - timedelta(days=120), end_date=today - timedelta(days=40),
            due_date=today - timedelta(days=30), status="approved",
            submitted_at=date_as_dt(today - timedelta(days=35)),
        )
        # Due and never submitted: late, not absent from the denominator.
        ReportingPeriod.objects.create(
            project=project, period_number=2,
            start_date=today - timedelta(days=40), end_date=today - timedelta(days=10),
            due_date=today - timedelta(days=5), status="open",
        )
        # Not due yet: outside the measurement entirely.
        ReportingPeriod.objects.create(
            project=project, period_number=3,
            start_date=today, end_date=today + timedelta(days=30),
            due_date=today + timedelta(days=40), status="upcoming",
        )

        ind = indicators_of(auth_client.get(URL).data)["1.8"]
        assert ind["value"] == 50.0  # 1 on time of 2 past due


@pytest.mark.django_db
class TestFinanceSection:

    def _line(self, project, source, instrument, usd):
        envelope = ProjectFinancialEnvelopeFactory(project=project)
        return FinancingSource.objects.create(
            envelope=envelope, source=source, instrument=instrument,
            amount=usd, amount_usd=usd, currency=CurrencyFactory(),
        )

    def test_shares_and_leverage_are_computed_on_commitments(self, auth_client):
        project = ProjectFactory()
        self._line(project, "llf", "grant", 100)
        self._line(project, "isdb_oc", "loan", 300)
        self._line(project, "co_financing", "co_financing", 100)

        found = indicators_of(auth_client.get(URL).data)
        assert found["3.4"]["value"] == 20.0    # grant 100 of 500
        assert found["3.7"]["value"] == 3.0     # OCR 300 : grant 100
        assert found["3.10"]["value"] == 20.0   # co-financing 100 of 500

    def test_portfolio_size_is_reported_in_billions(self, auth_client):
        self._line(ProjectFactory(), "llf", "grant", 2_310_000_000)
        assert indicators_of(auth_client.get(URL).data)["3.1"]["value"] == 2.31


@pytest.mark.django_db
class TestPipelineSection:

    def _reach(self, project, stage, on):
        return ProjectStageTransition.objects.create(
            project=project, from_stage="LS001", to_stage=stage, transition_date=on,
        )

    def test_endorsement_to_effectiveness_averages_over_both_dates(self, auth_client):
        one, two = ProjectFactory(), ProjectFactory()
        self._reach(one, "LS006", date(2024, 1, 1))
        self._reach(one, "LS012", date(2025, 1, 1))    # ~12 months
        self._reach(two, "LS006", date(2024, 1, 1))
        self._reach(two, "LS012", date(2024, 7, 1))    # ~6 months

        ind = indicators_of(auth_client.get(URL).data)["4.2"]
        assert 8.5 <= ind["value"] <= 9.5   # average of ~12 and ~6

    def test_a_project_missing_one_end_is_left_out_not_counted_as_zero(self, auth_client):
        project = ProjectFactory()
        self._reach(project, "LS006", date(2024, 1, 1))  # never becomes effective

        ind = indicators_of(auth_client.get(URL).data)["4.2"]
        assert ind["available"] is True
        assert ind["value"] is None

    def test_a_transition_without_an_effective_date_is_skipped(self, auth_client):
        """transitioned_at records when someone typed it, which is not when the
        stage changed. Falling back to it would fabricate a timeline."""
        project = ProjectFactory()
        ProjectStageTransition.objects.create(
            project=project, from_stage="LS001", to_stage="LS006", transition_date=None,
        )
        self._reach(project, "LS012", date(2025, 1, 1))

        assert indicators_of(auth_client.get(URL).data)["4.2"]["value"] is None


@pytest.mark.django_db
class TestScope:

    def test_a_user_with_no_role_sees_an_empty_denominator(self):
        """Scoping is not decoration: a user who may see nothing must get
        nothing counted, not the whole fund's figures."""
        ProjectFactory(we_category="WE001")
        ProjectFactory(we_category="WE005")

        client = APIClient()
        client.force_authenticate(user=UserFactory(is_superuser=False))
        payload = client.get(URL).data

        assert payload["summary"]["projects_in_scope"] == 0
        assert indicators_of(payload)["1.5"]["value"] is None

    def test_a_global_user_sees_the_whole_portfolio(self, auth_client):
        ProjectFactory()
        ProjectFactory()
        assert auth_client.get(URL).data["summary"]["projects_in_scope"] == 2


def date_as_dt(day):
    """ReportingPeriod.submitted_at is a datetime; the tests reason in dates."""
    from datetime import datetime, time

    from django.utils import timezone

    return timezone.make_aware(datetime.combine(day, time(12, 0)))

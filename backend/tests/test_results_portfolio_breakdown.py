"""Tests API — project breakdown of the portfolio results aggregation.

The breakdown listed one row per approved value, so a project reporting over
several periods appeared once per period. For indicators with the "sum" rule
it now lists one row per project, carrying the sum of that project's values;
the other rules keep one row per value for the time being.
"""
from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.project.models import ProjectWorkspace, ReportingPeriod
from apps.results.models import Indicator, LogframeRow, LogframeTarget, ResultsData
from tests.factories import ProjectFactory, SectorFactory, UserFactory

URL = "/api/results/portfolio/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def indicator_with_rule(rule):
    return Indicator.objects.create(
        code=f"BRK-{rule}",
        sector=SectorFactory(),
        name="Households reached",
        indicator_type="output",
        direction="increase",
        definition="A definition.",
        unit="Number",
        aggregation_rule=rule,
    )


def report(project, indicator, values, target):
    """An active project reporting `values` on `indicator`, one approved
    value per period, against a single target."""
    ProjectWorkspace.objects.get_or_create(project=project)
    row = LogframeRow.objects.create(project=project, indicator=indicator, chain_level="output")
    LogframeTarget.objects.create(
        logframe_row=row, target_value=Decimal(target), target_date=date(2027, 12, 31),
    )
    for n, value in enumerate(values, start=1):
        period = ReportingPeriod.objects.create(
            project=project, period_number=n,
            start_date=date(2026, n, 1), end_date=date(2026, n, 28), due_date=date(2026, n + 1, 15),
        )
        ResultsData.objects.create(
            logframe_row=row, reporting_period=period,
            actual_value=Decimal(value), status="approved",
        )


def portfolio_indicator(client, indicator):
    rows = client.get(URL).data["indicators"]
    return next(r for r in rows if r["indicator_id"] == indicator.id)


@pytest.mark.django_db
class TestBreakdownPerProject:

    def test_sum_rule_lists_each_project_once(self, auth_client):
        indicator = indicator_with_rule("sum")
        first, second = ProjectFactory(), ProjectFactory()
        report(first, indicator, ["5", "10"], "50")
        report(second, indicator, ["20"], "40")

        ind = portfolio_indicator(auth_client, indicator)

        by_project = {b["project_id"]: b for b in ind["breakdown"]}
        assert len(ind["breakdown"]) == 2
        assert Decimal(by_project[first.id]["actual_value"]) == 15
        assert Decimal(by_project[first.id]["achievement_rate"]) == 30
        assert by_project[first.id]["rag_status"] == "red"
        assert Decimal(by_project[second.id]["actual_value"]) == 20
        assert ind["projects_count"] == 2
        assert Decimal(ind["aggregated_value"]) == 35

    def test_other_rules_keep_one_row_per_value(self, auth_client):
        indicator = indicator_with_rule("maximum")
        report(ProjectFactory(), indicator, ["5", "10"], "50")

        ind = portfolio_indicator(auth_client, indicator)

        assert len(ind["breakdown"]) == 2
        assert Decimal(ind["aggregated_value"]) == 10

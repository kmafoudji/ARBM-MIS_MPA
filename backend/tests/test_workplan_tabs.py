"""Tests API — les lectures que les onglets du workplan ajoutent (M3).

Deux lectures nouvelles, toutes deux en lecture seule :

  * les jalons voyagent désormais avec l'activité — la vue workplan les
    préchargeait déjà sans jamais les servir, si bien que la branche jalons du
    Gantt ne se dessinait pas ;
  * le journal des retards existe au niveau du projet, et pas seulement
    activité par activité.

Comme pour le tableau de bord Tier III, ce que l'API refuse d'inventer compte
autant que ce qu'elle calcule : un output sans ligne de cadre logique rend un
indicateur `None`, pas une chaîne vide.
"""
from datetime import date, timedelta

import pytest
from rest_framework.test import APIClient

from apps.results.models import TheoryOfChange, ToCNode
from apps.workplan.models import (
    Activity,
    DelayLog,
    Milestone,
    WorkplanComponent,
    WorkplanSubComponent,
)
from tests.factories import ProjectFactory, UserFactory


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def build_activity(project, *, code="A1.1.1", output_node=None):
    component = WorkplanComponent.objects.create(project=project, code="A", name="Composante A")
    sub = WorkplanSubComponent.objects.create(component=component, code="A1", name="Sous-composante A1")
    return Activity.objects.create(
        sub_component=sub,
        code=code,
        name="Activité de test",
        planned_start=date(2026, 1, 1),
        planned_end=date(2026, 6, 30),
        output_node=output_node,
    )


@pytest.mark.django_db
class TestMilestonesTravelWithTheActivity:

    def test_workplan_payload_carries_the_milestones(self, auth_client):
        project = ProjectFactory()
        activity = build_activity(project)
        Milestone.objects.create(
            activity=activity, name="Spécifications arrêtées",
            category="programmatic", planned_date=date(2026, 3, 31),
            status="achieved", actual_date=date(2026, 3, 20), is_gate=True,
        )

        payload = auth_client.get(f"/api/projects/{project.pk}/workplan/").data
        served = payload[0]["sub_components"][0]["activities"][0]

        assert served["milestones_count"] == 1
        assert [m["name"] for m in served["milestones"]] == ["Spécifications arrêtées"]
        assert served["milestones"][0]["is_gate"] is True
        assert served["milestones"][0]["status_display"]

    def test_activity_list_carries_them_too(self, auth_client):
        project = ProjectFactory()
        activity = build_activity(project)
        Milestone.objects.create(
            activity=activity, name="Jalon", category="reporting",
            planned_date=date(2026, 4, 30),
        )
        rows = auth_client.get(f"/api/projects/{project.pk}/workplan/activities/").data
        assert len(rows[0]["milestones"]) == 1

    def test_an_activity_without_milestones_serves_an_empty_list(self, auth_client):
        project = ProjectFactory()
        build_activity(project)
        rows = auth_client.get(f"/api/projects/{project.pk}/workplan/activities/").data
        assert rows[0]["milestones"] == []


@pytest.mark.django_db
class TestOutputNodesCarryTheirChain:

    def test_parent_outcome_and_absent_indicator_are_both_reported(self, auth_client):
        project = ProjectFactory()
        toc = TheoryOfChange.objects.create(project=project)
        outcome = ToCNode.objects.create(
            toc=toc, chain_level="intermediate_outcome", code="A",
            statement="Productivité accrue",
        )
        ToCNode.objects.create(
            toc=toc, parent=outcome, chain_level="output", code="A 1.1",
            statement="<p>10 000 ovins distribués</p>",
        )

        nodes = auth_client.get(f"/api/projects/{project.pk}/workplan/output-nodes/").data
        assert len(nodes) == 1
        assert nodes[0]["parent_code"] == "A"
        assert nodes[0]["parent_statement"] == "Productivité accrue"
        # Aucune ligne de cadre logique : l'indicateur est absent, pas vide.
        assert nodes[0]["indicator_code"] is None

    def test_an_orphan_output_reports_no_parent(self, auth_client):
        project = ProjectFactory()
        toc = TheoryOfChange.objects.create(project=project)
        ToCNode.objects.create(
            toc=toc, chain_level="output", code="B 1.1", statement="Output orphelin",
        )
        nodes = auth_client.get(f"/api/projects/{project.pk}/workplan/output-nodes/").data
        assert nodes[0]["parent_code"] is None


@pytest.mark.django_db
class TestProjectDelayLog:

    def _delay(self, activity, *, days, category="procurement", approval="pending"):
        previous = activity.planned_end
        return DelayLog.objects.create(
            activity=activity,
            previous_end=previous,
            revised_end=previous + timedelta(days=days),
            variance_days=days,
            cumulative_variance_days=days,
            delay_category=category,
            justification="Re-spécification après revue.",
            approval_status=approval,
        )

    def test_it_gathers_every_activity_of_the_project(self, auth_client):
        project = ProjectFactory()
        first = build_activity(project, code="A1.1.1")
        second = Activity.objects.create(
            sub_component=first.sub_component, code="A1.1.2", name="Deuxième activité",
            planned_start=date(2026, 2, 1), planned_end=date(2026, 8, 31),
        )
        self._delay(first, days=30)
        self._delay(second, days=71)

        rows = auth_client.get(f"/api/projects/{project.pk}/workplan/delays/").data
        assert len(rows) == 2
        assert {r["activity_code"] for r in rows} == {"A1.1.1", "A1.1.2"}
        assert all(r["activity_name"] for r in rows)
        # Le retard le plus tardif d'abord.
        assert rows[0]["variance_days"] == 71

    def test_another_project_delay_does_not_leak(self, auth_client):
        project = ProjectFactory()
        other = ProjectFactory()
        self._delay(build_activity(project), days=10)
        self._delay(build_activity(other, code="Z9.9.9"), days=10)

        rows = auth_client.get(f"/api/projects/{project.pk}/workplan/delays/").data
        assert [r["activity_code"] for r in rows] == ["A1.1.1"]

    def test_it_filters_on_approval_status_and_category(self, auth_client):
        project = ProjectFactory()
        activity = build_activity(project)
        self._delay(activity, days=10, category="procurement", approval="pending")
        self._delay(activity, days=20, category="weather", approval="approved")

        base = f"/api/projects/{project.pk}/workplan/delays/"
        assert len(auth_client.get(f"{base}?approval_status=pending").data) == 1
        assert len(auth_client.get(f"{base}?delay_category=weather").data) == 1

    def test_no_delay_is_an_empty_list_not_a_404(self, auth_client):
        project = ProjectFactory()
        build_activity(project)
        response = auth_client.get(f"/api/projects/{project.pk}/workplan/delays/")
        assert response.status_code == 200
        assert response.data == []

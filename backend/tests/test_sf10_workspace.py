"""
Tests SF-10 — Génération du workspace à Effective.
"""
import pytest
from apps.project.services import transition_stage, generate_workspace
from apps.project.models import ProjectWorkspace
from tests.factories import ProjectFactory, UserFactory, SdgFactory


def make_effective_project():
    """Crée un projet avec la classification complète pour passer BED→Effective."""
    from datetime import date
    sdg = SdgFactory(number=2)
    return ProjectFactory(
        lifecycle_stage="bed_approved",
        primary_sdg=sdg,
        gender_marker="1",
        implementation_modality="direct",
        geographic_typology="rural",
        fragility_status="stable",
        risk_rating="low",
        start_date=date(2026, 1, 1),
        end_date=date(2029, 12, 31),
    )


@pytest.mark.django_db
class TestGenerateWorkspace:

    def test_workspace_created_on_effective(self):
        actor = UserFactory()
        project = make_effective_project()
        transition_stage(project, "effective", actor)
        assert ProjectWorkspace.objects.filter(project=project).exists()

    def test_workspace_not_created_on_other_stages(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="concept_note")
        transition_stage(project, "pipeline_taskforce_review", actor)
        assert not ProjectWorkspace.objects.filter(project=project).exists()

    def test_workspace_is_idempotent(self):
        """Appeler generate_workspace deux fois ne crée qu'un seul workspace."""
        actor = UserFactory()
        project = make_effective_project()
        generate_workspace(project, actor)
        generate_workspace(project, actor)
        assert ProjectWorkspace.objects.filter(project=project).count() == 1

    def test_workspace_activated_by_is_set(self):
        actor = UserFactory()
        project = make_effective_project()
        transition_stage(project, "effective", actor)
        ws = ProjectWorkspace.objects.get(project=project)
        assert ws.activated_by == actor

    def test_toc_locked_on_effective(self):
        from apps.results.models import TheoryOfChange
        actor = UserFactory()
        project = make_effective_project()
        # Créer une ToC pour ce projet
        TheoryOfChange.objects.create(project=project, status="draft")
        transition_stage(project, "effective", actor)
        toc = TheoryOfChange.objects.get(project=project)
        assert toc.status == "locked"

    def test_m5_gis_ready_if_gadm_scope_exists(self):
        from apps.reference.models import GadmArea
        from apps.project.models import ProjectGadmScope
        actor = UserFactory()
        project = make_effective_project()
        # Créer une zone GADM fictive
        country = project.project_countries.first().country
        area = GadmArea.objects.create(
            country=country, level=1, name="Test Region", gadm_uid="TST.1_1"
        )
        ProjectGadmScope.objects.create(project=project, area=area)
        generate_workspace(project, actor)
        ws = ProjectWorkspace.objects.get(project=project)
        assert ws.m5_gis_ready is True

    def test_m5_gis_not_ready_without_scope(self):
        actor = UserFactory()
        project = make_effective_project()
        generate_workspace(project, actor)
        ws = ProjectWorkspace.objects.get(project=project)
        assert ws.m5_gis_ready is False

    def test_reporting_periods_generated_if_prerequisites_met(self):
        from datetime import date
        from apps.project.models import ReportingPeriod
        actor = UserFactory()
        project = make_effective_project()
        project.reporting_frequency = "quarterly"
        project.next_reporting_due = date(2026, 4, 1)
        project.save()
        transition_stage(project, "effective", actor)
        assert ReportingPeriod.objects.filter(project=project).count() > 0

    def test_reporting_periods_not_generated_without_end_date(self):
        from datetime import date
        from apps.project.models import ReportingPeriod
        actor = UserFactory()
        # Projet sans end_date
        from tests.factories import SdgFactory
        sdg = SdgFactory(number=4)
        project = ProjectFactory(
            lifecycle_stage="bed_approved",
            primary_sdg=sdg,
            gender_marker="1",
            implementation_modality="direct",
            geographic_typology="rural",
            fragility_status="stable",
            risk_rating="low",
            start_date=date(2026, 1, 1),
            end_date=None,
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
        )
        transition_stage(project, "effective", actor)
        assert ReportingPeriod.objects.filter(project=project).count() == 0

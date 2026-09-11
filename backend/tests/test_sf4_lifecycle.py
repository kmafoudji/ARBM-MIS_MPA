"""
Tests SF-4 — Cycle de vie et transitions d'étape.
Couvre les règles POL-1.09, RG-4.1, RG-3.5.
"""
import pytest
from django.core.exceptions import ValidationError

from apps.project.services import transition_stage
from tests.factories import ProjectFactory, UserFactory


@pytest.mark.django_db
class TestTransitionStageForward:
    """Progression avant — cas nominaux."""

    def test_forward_transition_succeeds(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS001")
        result = transition_stage(project, "LS002", actor)
        assert result.lifecycle_stage == "LS002"

    def test_transition_creates_audit_entry(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS001")
        transition_stage(project, "LS002", actor)
        assert project.stage_transitions.count() == 1
        t = project.stage_transitions.first()
        assert t.from_stage == "LS001"
        assert t.to_stage == "LS002"
        assert t.transitioned_by == actor

    def test_same_stage_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS001")
        with pytest.raises(ValidationError):
            transition_stage(project, "LS001", actor)


@pytest.mark.django_db
class TestTransitionStageGates:
    """Gates d'approbation — autorisation double obligatoire."""

    def test_gate_trc_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS004")
        with pytest.raises(ValidationError, match="autorisation double"):
            transition_stage(project, "LS005", actor)

    def test_gate_trc_succeeds_with_dual_auth(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS004")
        result = transition_stage(project, "LS005", actor, dual_authorized_by=approver)
        assert result.lifecycle_stage == "LS005"

    def test_dual_auth_same_person_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS004")
        with pytest.raises(ValidationError, match="distinct"):
            transition_stage(project, "LS005", actor, dual_authorized_by=actor)

    def test_gate_ic_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS005")
        with pytest.raises(ValidationError):
            transition_stage(project, "LS006", actor)

    def test_gate_bed_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS009")
        approver = UserFactory()
        # BED exige aussi la classification complète — on teste juste la règle dual auth
        with pytest.raises(ValidationError):
            transition_stage(project, "LS010", actor)


@pytest.mark.django_db
class TestTransitionStageBackward:
    """Retour arrière — justification + dual auth obligatoires."""

    def test_backward_without_justification_raises(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS002")
        with pytest.raises(ValidationError, match="justification"):
            transition_stage(project, "LS001", actor,
                           dual_authorized_by=approver)

    def test_backward_without_dual_auth_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS002")
        with pytest.raises(ValidationError, match="autorisation double"):
            transition_stage(project, "LS001", actor,
                           justification="Erreur de saisie")

    def test_backward_with_justification_and_dual_auth_succeeds(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS002")
        result = transition_stage(
            project, "LS001", actor,
            justification="Erreur de saisie initiale",
            dual_authorized_by=approver,
        )
        assert result.lifecycle_stage == "LS001"

    def test_exception_stages_allowed(self):
        """Suspended et Cancelled sont des états d'exception toujours accessibles."""
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS013")
        result = transition_stage(project, "LS017", actor,
                                  justification="Force majeure")
        assert result.lifecycle_stage == "LS017"


@pytest.mark.django_db
class TestBedApprovedPrerequisites:
    """BED Approved gate — classification complète obligatoire."""

    def test_bed_approved_blocked_without_classification(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS009")
        # Sans classification → ValidationError
        with pytest.raises(ValidationError):
            transition_stage(project, "LS010", actor,
                           dual_authorized_by=approver)

    def test_bed_approved_succeeds_with_full_classification(self):
        from datetime import date
        from tests.factories import SdgFactory
        actor = UserFactory()
        approver = UserFactory()
        sdg = SdgFactory(number=3)
        project = ProjectFactory(
            lifecycle_stage="LS009",
            we_category="WE001",
            risk_rating="tbd",
            start_date=date(2026, 1, 1),
            end_date=date(2028, 12, 31),
        )
        # POL-1.10 reads "at least one SDG" since ADR 0006: without any, blocked.
        with pytest.raises(ValidationError, match="ODD"):
            transition_stage(project, "LS010", actor,
                             dual_authorized_by=approver)
        project.sdgs.add(sdg)
        result = transition_stage(project, "LS010", actor,
                                 dual_authorized_by=approver)
        assert result.lifecycle_stage == "LS010"


@pytest.mark.django_db
class TestLifecycleSeptember2026:
    """Liste definitive de septembre 2026 : 16 etapes LS001-LS016 + 2 exceptions."""

    def test_order_is_the_sixteen_codes(self):
        from apps.project.models import EXCEPTION_STAGES, LIFECYCLE_ORDER

        assert LIFECYCLE_ORDER == [f"LS{n:03d}" for n in range(1, 17)]
        assert EXCEPTION_STAGES == {"LS017", "LS018"}

    def test_new_stages_are_not_gates(self):
        """IsDB AWP, Preparations et Signature : pas d'autorisation double."""
        from apps.project.models import GATE_STAGES

        assert GATE_STAGES == {"LS005", "LS006", "LS010"}
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS006")
        for stage in ("LS007", "LS008", "LS009"):
            project = transition_stage(project, stage, actor)
        assert project.lifecycle_stage == "LS009"

    def test_signature_leads_to_effective_and_its_workspace(self):
        from apps.project.models import ProjectWorkspace

        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="LS010")
        project = transition_stage(project, "LS011", actor)
        assert not ProjectWorkspace.objects.filter(project=project).exists()
        project = transition_stage(project, "LS012", actor)
        assert ProjectWorkspace.objects.filter(project=project).exists()

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
        project = ProjectFactory(lifecycle_stage="concept_note")
        result = transition_stage(project, "pipeline_taskforce_review", actor)
        assert result.lifecycle_stage == "pipeline_taskforce_review"

    def test_transition_creates_audit_entry(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="concept_note")
        transition_stage(project, "pipeline_taskforce_review", actor)
        assert project.stage_transitions.count() == 1
        t = project.stage_transitions.first()
        assert t.from_stage == "concept_note"
        assert t.to_stage == "pipeline_taskforce_review"
        assert t.transitioned_by == actor

    def test_same_stage_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="concept_note")
        with pytest.raises(ValidationError):
            transition_stage(project, "concept_note", actor)


@pytest.mark.django_db
class TestTransitionStageGates:
    """Gates d'approbation — autorisation double obligatoire."""

    def test_gate_trc_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="preparation_identification")
        with pytest.raises(ValidationError, match="autorisation double"):
            transition_stage(project, "trc_endorsed", actor)

    def test_gate_trc_succeeds_with_dual_auth(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="preparation_identification")
        result = transition_stage(project, "trc_endorsed", actor, dual_authorized_by=approver)
        assert result.lifecycle_stage == "trc_endorsed"

    def test_dual_auth_same_person_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="preparation_identification")
        with pytest.raises(ValidationError, match="distinct"):
            transition_stage(project, "trc_endorsed", actor, dual_authorized_by=actor)

    def test_gate_ic_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="trc_endorsed")
        with pytest.raises(ValidationError):
            transition_stage(project, "ic_approved", actor)

    def test_gate_bed_requires_dual_auth(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="appraisal")
        approver = UserFactory()
        # BED exige aussi la classification complète — on teste juste la règle dual auth
        with pytest.raises(ValidationError):
            transition_stage(project, "bed_approved", actor)


@pytest.mark.django_db
class TestTransitionStageBackward:
    """Retour arrière — justification + dual auth obligatoires."""

    def test_backward_without_justification_raises(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="pipeline_taskforce_review")
        with pytest.raises(ValidationError, match="justification"):
            transition_stage(project, "concept_note", actor,
                           dual_authorized_by=approver)

    def test_backward_without_dual_auth_raises(self):
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="pipeline_taskforce_review")
        with pytest.raises(ValidationError, match="autorisation double"):
            transition_stage(project, "concept_note", actor,
                           justification="Erreur de saisie")

    def test_backward_with_justification_and_dual_auth_succeeds(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="pipeline_taskforce_review")
        result = transition_stage(
            project, "concept_note", actor,
            justification="Erreur de saisie initiale",
            dual_authorized_by=approver,
        )
        assert result.lifecycle_stage == "concept_note"

    def test_exception_stages_allowed(self):
        """Suspended et Cancelled sont des états d'exception toujours accessibles."""
        actor = UserFactory()
        project = ProjectFactory(lifecycle_stage="implementing")
        result = transition_stage(project, "suspended", actor,
                                  justification="Force majeure")
        assert result.lifecycle_stage == "suspended"


@pytest.mark.django_db
class TestBedApprovedPrerequisites:
    """BED Approved gate — classification complète obligatoire."""

    def test_bed_approved_blocked_without_classification(self):
        actor = UserFactory()
        approver = UserFactory()
        project = ProjectFactory(lifecycle_stage="appraisal")
        # Sans classification → ValidationError
        with pytest.raises(ValidationError):
            transition_stage(project, "bed_approved", actor,
                           dual_authorized_by=approver)

    def test_bed_approved_succeeds_with_full_classification(self):
        from datetime import date
        from tests.factories import SdgFactory
        actor = UserFactory()
        approver = UserFactory()
        sdg = SdgFactory(number=3)
        project = ProjectFactory(
            lifecycle_stage="appraisal",
            we_category="WE001",
            risk_rating="tbd",
            start_date=date(2026, 1, 1),
            end_date=date(2028, 12, 31),
        )
        # POL-1.10 reads "at least one SDG" since ADR 0006: without any, blocked.
        with pytest.raises(ValidationError, match="ODD"):
            transition_stage(project, "bed_approved", actor,
                             dual_authorized_by=approver)
        project.sdgs.add(sdg)
        result = transition_stage(project, "bed_approved", actor,
                                 dual_authorized_by=approver)
        assert result.lifecycle_stage == "bed_approved"

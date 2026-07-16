"""
Gestion des transitions d'etape du cycle de vie projet (SF-4).

Regles appliquees (SFD Module 1) :
  - Progression avant uniquement par defaut (POL-1.09).
  - Tout retour arriere exige une justification ET une autorisation
    double (dual_authorized_by renseigne).
  - Les transitions vers/depuis les gates d'approbation (TRC Endorsed,
    IC Approved, BED Approved) exigent toujours une autorisation double,
    meme en progression avant.
  - Toute transition est journalisee dans ProjectStageTransition
    (RG-4.1, BRQ-1.20) — piste d'audit immuable (pas d'update/delete
    prevu sur ce modele).
"""
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import GATE_STAGES, LIFECYCLE_ORDER, ProjectStageTransition


def _stage_index(stage_code):
    """Renvoie la position dans l'ordre lineaire, ou None si etat d'exception."""
    try:
        return LIFECYCLE_ORDER.index(stage_code)
    except ValueError:
        return None


@transaction.atomic
def transition_stage(
    project,
    to_stage,
    actor,
    justification="",
    dual_authorized_by=None,
    document_reference="",
):
    """
    Fait transiter `project` vers `to_stage`. Leve ValidationError si la
    transition viole une regle SF-4. Cree l'entree d'audit
    ProjectStageTransition et met a jour project.lifecycle_stage.
    """
    from_stage = project.lifecycle_stage

    if from_stage == to_stage:
        raise ValidationError("Le projet est deja a cette etape.")

    from_idx = _stage_index(from_stage)
    to_idx = _stage_index(to_stage)

    is_exception_move = from_idx is None or to_idx is None
    is_backward = (
        not is_exception_move and to_idx is not None and from_idx is not None and to_idx < from_idx
    )
    is_gate = to_stage in GATE_STAGES or from_stage in GATE_STAGES

    if is_backward and not justification:
        raise ValidationError(
            "Retour arriere : une justification est obligatoire (POL-1.09)."
        )
    if (is_backward or is_gate) and not dual_authorized_by:
        raise ValidationError(
            "Cette transition (gate d'approbation ou retour arriere) exige une "
            "autorisation double : renseignez dual_authorized_by."
        )
    if dual_authorized_by and dual_authorized_by == actor:
        raise ValidationError(
            "L'autorisation double exige un second approbateur distinct de l'auteur "
            "de la transition (RG-3.5 / RG-4.1)."
        )
    if to_stage == "bed_approved":
        _check_bed_approved_classification_complete(project)

    ProjectStageTransition.objects.create(
        project=project,
        from_stage=from_stage,
        to_stage=to_stage,
        transitioned_by=actor,
        justification=justification,
        document_reference=document_reference,
        dual_authorized_by=dual_authorized_by,
    )
    project.lifecycle_stage = to_stage
    project.save(update_fields=["lifecycle_stage", "updated_at"])
    return project


def _check_bed_approved_classification_complete(project):
    """POL-1.10 : le franchissement de BED Approved est bloque tant que la
    classification (SF-2) n'est pas complete."""
    missing = []
    if not project.primary_sdg_id:
        missing.append("ODD primaire")
    if not project.gender_marker:
        missing.append("Marqueur Genre")
    if not project.implementation_modality:
        missing.append("Modalite de mise en oeuvre")
    if not project.geographic_typology:
        missing.append("Typologie geographique")
    if not project.fragility_status:
        missing.append("Statut de fragilite")
    if not project.risk_rating:
        missing.append("Notation de risque composite")

    if missing:
        raise ValidationError(
            "POL-1.10 : classification incomplete, BED Approved bloque. "
            "Champs manquants : " + ", ".join(missing)
        )

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

from .models import GATE_STAGES, LIFECYCLE_ORDER, Project, ProjectCountry, ProjectSdg, ProjectStageTransition


@transaction.atomic
def set_project_sdgs(project, contributing_sdg_numbers):
    """
    Remplace l'ensemble des ODD contributifs d'un projet (SF-2). L'ODD
    primaire ne doit pas apparaitre aussi comme contributif.
    """
    contributing_sdg_numbers = list(dict.fromkeys(contributing_sdg_numbers))
    if project.primary_sdg_id and project.primary_sdg_id in contributing_sdg_numbers:
        raise ValidationError(
            "L'ODD primaire ne peut pas aussi etre selectionne comme ODD contributif."
        )
    ProjectSdg.objects.filter(project=project).delete()
    ProjectSdg.objects.bulk_create(
        [ProjectSdg(project=project, sdg_id=n) for n in contributing_sdg_numbers]
    )
    return project


@transaction.atomic
def set_project_countries(project, country_ids, lead_country_id):
    """
    Remplace l'ensemble des pays d'un projet (R13 revisee : multi-pays,
    un seul pays chef de file). Regenere le code projet a partir du pays
    chef de file (POL-1.05) — le code n'est donc connu qu'une fois cette
    fonction appelee au moins une fois.
    """
    country_ids = list(dict.fromkeys(country_ids))  # dedoublonne en gardant l'ordre
    if not country_ids:
        raise ValidationError("Un projet doit avoir au moins un pays.")
    if lead_country_id not in country_ids:
        raise ValidationError("Le pays chef de file doit faire partie des pays selectionnes.")

    ProjectCountry.objects.filter(project=project).delete()
    ProjectCountry.objects.bulk_create(
        [
            ProjectCountry(project=project, country_id=cid, is_lead=(cid == lead_country_id))
            for cid in country_ids
        ]
    )
    project.code = generate_project_code(project)
    project.save(update_fields=["code"])
    return project


def generate_project_code(project):
    """Code interne unique : <ISO3 pays chef de file>-<sequence 4 chiffres> (POL-1.05)."""
    lead = project.lead_country
    prefix = lead.iso3 if lead else "XXX"
    existing = Project.objects.filter(code__startswith=f"{prefix}-").exclude(pk=project.pk).count()
    candidate = f"{prefix}-{existing + 1:04d}"
    while Project.objects.filter(code=candidate).exclude(pk=project.pk).exists():
        existing += 1
        candidate = f"{prefix}-{existing + 1:04d}"
    return candidate


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

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

from .models import (
    GATE_STAGES,
    LIFECYCLE_ORDER,
    LIFECYCLE_STAGE_CHOICES,
    Project,
    ProjectCountry,
    ProjectSdg,
    ProjectSector,
    ProjectStageTransition,
)


@transaction.atomic
def set_project_sdgs(project, sdg_numbers):
    """
    Remplace l'ensemble des ODD d'un projet (SF-2). Il n'y a plus d'ODD
    primaire : un seul ensemble, sans ordre (ADR 0006).
    """
    sdg_numbers = list(dict.fromkeys(sdg_numbers))
    ProjectSdg.objects.filter(project=project).delete()
    ProjectSdg.objects.bulk_create(
        [ProjectSdg(project=project, sdg_id=n) for n in sdg_numbers]
    )
    return project


@transaction.atomic
def set_project_sectors(project, contributing_sector_ids):
    """
    Remplace l'ensemble des secteurs contributifs d'un projet. Contrairement
    aux ODD (ADR 0006), les secteurs gardent un primaire : le portefeuille,
    les rapports et l'admin agregent dessus. Le secteur primaire ne doit
    pas apparaitre aussi comme contributif.
    """
    contributing_sector_ids = list(dict.fromkeys(contributing_sector_ids))
    if project.primary_sector_id and project.primary_sector_id in contributing_sector_ids:
        raise ValidationError(
            "Le secteur primaire ne peut pas aussi etre selectionne comme secteur contributif."
        )
    ProjectSector.objects.filter(project=project).delete()
    ProjectSector.objects.bulk_create(
        [ProjectSector(project=project, sector_id=sid) for sid in contributing_sector_ids]
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
    transition_date=None,
):
    """
    Fait transiter `project` vers `to_stage`. Leve ValidationError si la
    transition viole une regle SF-4. Cree l'entree d'audit
    ProjectStageTransition et met a jour project.lifecycle_stage.
    """
    from_stage = project.lifecycle_stage

    if from_stage == to_stage:
        raise ValidationError("Le projet est deja a cette etape.")

    # Qui a le droit de declencher cette transition (SF-4). Le controle vit
    # ici, dans le service, et non dans la vue : toute autre voie d'appel
    # (commande de gestion, tache Celery, script) y est soumise aussi.
    check_transition_authorization(actor, to_stage, dual_authorized_by)

    from_idx = _stage_index(from_stage)
    to_idx = _stage_index(to_stage)

    is_exception_move = from_idx is None or to_idx is None
    is_backward = (
        not is_exception_move and to_idx is not None and from_idx is not None and to_idx < from_idx
    )
    is_gate = to_stage in GATE_STAGES or from_stage in GATE_STAGES

    from django.conf import settings
    rbac_enforced = getattr(settings, "RBAC_ENFORCED", False)

    # La justification obligatoire en retour arriere (POL-1.09) suit le meme
    # interrupteur que l'autorisation double : desactivee tant que
    # RBAC_ENFORCED est faux, pour permettre les tests du cycle de vie.
    if rbac_enforced and is_backward and not justification:
        raise ValidationError(
            "Retour arriere : une justification est obligatoire (POL-1.09)."
        )
    if rbac_enforced:
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
        _check_bed_approved_prerequisites_complete(project)

    ProjectStageTransition.objects.create(
        project=project,
        from_stage=from_stage,
        to_stage=to_stage,
        transitioned_by=actor,
        transition_date=transition_date,
        justification=justification,
        document_reference=document_reference,
        dual_authorized_by=dual_authorized_by,
    )
    project.lifecycle_stage = to_stage
    project.save(update_fields=["lifecycle_stage", "updated_at"])

    # SF-10 : génération du workspace au passage à Effective
    if to_stage == "effective":
        try:
            generate_workspace(project, actor)
        except Exception:
            pass  # Non bloquant — la transition est déjà enregistrée

    return project


def _check_bed_approved_prerequisites_complete(project):
    """
    Le franchissement de BED Approved est bloque tant que :
    - la classification (SF-2) n'est pas complete (POL-1.10) ;
    - les dates de debut/fin (SF-1 Etape 3) ne sont pas renseignees. Le SFD
      les qualifie de "Requises a partir de l'approbation ; duree indicative
      acceptee en pre-pipeline" — BED Approved est le seul gate impose
      ailleurs dans le code (POL-1.10), donc c'est ce point qui sert ici de
      lecture de "l'approbation". A ajuster si le metier vise un stade plus
      precoce (ex. Pipeline Taskforce Approved).
    """
    missing = []
    if not project.sdgs.exists():
        missing.append("ODD (au moins un)")
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
    if not project.start_date:
        missing.append("Date de debut")
    if not project.end_date:
        missing.append("Date de fin")

    if missing:
        raise ValidationError(
            "POL-1.10 : prerequis incomplets, BED Approved bloque. "
            "Champs manquants : " + ", ".join(missing)
        )


# ---------------------------------------------------------------------------
# SF-4 : autorisation de transition par etape
# ---------------------------------------------------------------------------
# Transcription de la table SF-4 du SFD (colonne « Autorisation transition »).
#
# Pourquoi une table en code plutot que la matrice RBAC en base : le SFD
# designe ici des ROLES NOMMES (« Concept Note -> LLFMU Portfolio Analyst »),
# pas des couples module x action. La matrice ne sait pas distinguer « creer
# un projet » de « creer un pays » — les deux sont un `create` sur
# m1_config_access. C'est d'ailleurs pour cela que PMU Project Manager et
# Implementing Partner, qui portent `create` sur ce module, pourraient sans
# ce controle enregistrer un projet : ce que le SFD leur interdit.
#
# LACUNE DE SPECIFICATION SIGNALEE : la table SF-4 nomme trois roles qui
# n'existent pas parmi les 11 acteurs definis au §2 du meme document —
# « Pipeline Manager », « Director » et « System Admin ». Faute de definition,
# les etapes concernees retombent sur le palier LLFMU (choix restrictif et
# documente, jamais silencieux). A trancher au niveau metier.

LLFMU_TIER = {
    "llfmu_manager",
    "llfmu_arbm_specialist",
    "llfmu_portfolio_analyst",
    "data_digital_analyst",
}
PMU_TIER = {"pmu_project_manager", "pmu_me_officer"}
HUB_TIER = {"regional_hub"}

# Etape visee -> roles autorises a la declencher
STAGE_ACTORS = {
    "concept_note": {"llfmu_portfolio_analyst", "llfmu_arbm_specialist"},
    "pipeline_taskforce_review": {"llfmu_portfolio_analyst"},
    # SFD : « Pipeline Manager » — role non defini au §2.
    "pipeline_taskforce_approved": LLFMU_TIER,
    "preparation_identification": {"llfmu_arbm_specialist"},
    "trc_endorsed": {"llfmu_arbm_specialist"},
    # SFD : « Double » sans preciser les roles.
    "ic_approved": LLFMU_TIER,
    "appraisal": {"llfmu_arbm_specialist"},
    # SFD : « Double (Pipeline Mgr + Director) » — roles non definis au §2.
    "bed_approved": LLFMU_TIER,
    "effective": LLFMU_TIER,
    "implementing": PMU_TIER | LLFMU_TIER,
    "mid_term_review": LLFMU_TIER,
    "substantially_complete": LLFMU_TIER,
    "closed": LLFMU_TIER,
    # SFD : « System Admin / LLFMU » — System Admin non defini au §2.
    "suspended": LLFMU_TIER,
    "cancelled": LLFMU_TIER,
}

# Etape visee -> roles admissibles comme SECOND approbateur (autorisation double)
STAGE_DUAL_ACTORS = {
    "trc_endorsed": HUB_TIER,   # SFD : Specialist + Hub OTL
    "appraisal": HUB_TIER,      # SFD : Specialist + Hub OTL
    "ic_approved": LLFMU_TIER,
    "bed_approved": LLFMU_TIER,
}


def _role_labels(codes):
    from apps.identity.models import Role

    labels = Role.objects.filter(code__in=codes).values_list("label", flat=True)
    return ", ".join(sorted(labels)) or ", ".join(sorted(codes))


def check_transition_authorization(actor, to_stage, dual_authorized_by=None):
    """
    Vérifie que `actor` porte un role habilité à faire entrer un projet dans
    `to_stage`, et que le second approbateur (le cas échéant) porte lui aussi
    un role admissible.

    Désactivé si RBAC_ENFORCED=False (settings) — permet de tester sans
    avoir à créer des RoleAssignment. À activer en production.
    """
    from django.conf import settings
    if not getattr(settings, "RBAC_ENFORCED", False):
        return  # RBAC neutralisé — toute transition est autorisée
    from apps.identity.services import get_user_role_codes

    # Compte technique d'exploitation : hors RBAC applicatif, comme partout
    # ailleurs (cf. identity.services.get_user_permissions).
    if actor and actor.is_superuser:
        return

    allowed = STAGE_ACTORS.get(to_stage, LLFMU_TIER)
    actor_roles = get_user_role_codes(actor)

    if not actor_roles:
        raise ValidationError(
            "Aucun role ne vous est attribue : transition refusee (RG-3.1, "
            "deny-by-default)."
        )
    if not (actor_roles & allowed):
        raise ValidationError(
            f"Votre role ne permet pas de faire passer un projet a l'etape "
            f"« {dict(LIFECYCLE_STAGE_CHOICES).get(to_stage, to_stage)} ». "
            f"Roles habilites : {_role_labels(allowed)}."
        )

    needed_dual = STAGE_DUAL_ACTORS.get(to_stage)
    if needed_dual and dual_authorized_by is not None:
        dual_roles = get_user_role_codes(dual_authorized_by)
        if not dual_authorized_by.is_superuser and not (dual_roles & needed_dual):
            raise ValidationError(
                f"Le second approbateur n'a pas un role admissible pour ce gate. "
                f"Roles attendus : {_role_labels(needed_dual)}."
            )


# ---------------------------------------------------------------------------
# SF-5 — Génération des périodes de reporting
# ---------------------------------------------------------------------------

from dateutil.relativedelta import relativedelta
from datetime import timedelta

GRACE_DAYS = {
    "quarterly":   30,  # T+30 jours après fin de période
    "semi_annual": 45,
    "annual":      60,
}

PERIOD_MONTHS = {
    "quarterly":   3,
    "semi_annual": 6,
    "annual":      12,
}

LABEL_FMT = {
    "quarterly":   lambda d: f"Q{((d.month - 1) // 3) + 1} {d.year}",
    "semi_annual": lambda d: f"S{1 if d.month <= 6 else 2} {d.year}",
    "annual":      lambda d: f"Annual {d.year}",
}


def generate_reporting_periods(project):
    """
    Génère les périodes de reporting pour un projet.

    Prérequis :
      - reporting_frequency  : fréquence (quarterly / semi_annual / annual)
      - next_reporting_due   : date de la première échéance (fin P1)
      - end_date             : date de fin du projet (borne le schedule)

    Idempotent : ne crée que les périodes manquantes.
    Retourne (nb_créées, message_erreur_ou_None).
    """
    from apps.project.models import ReportingPeriod

    if not project.reporting_frequency:
        return 0, "Reporting frequency not set."
    if not project.next_reporting_due:
        return 0, "First deadline (next_reporting_due) not set."
    if not project.end_date:
        return 0, "Project end date is required to generate the reporting schedule."

    freq   = project.reporting_frequency
    months = PERIOD_MONTHS.get(freq, 3)
    grace  = timedelta(days=GRACE_DAYS.get(freq, 30))
    fmt    = LABEL_FMT.get(freq, lambda d: str(d))

    # Période 1 : first_deadline = fin de P1
    # Début P1 = first_deadline - durée + 1 jour
    p1_end   = project.next_reporting_due
    p1_start = p1_end - relativedelta(months=months) + timedelta(days=1)
    horizon  = project.end_date

    existing = set(
        ReportingPeriod.objects.filter(project=project).values_list("period_number", flat=True)
    )

    periods = []
    n = 1
    current_start = p1_start

    while current_start <= horizon:
        current_end = current_start + relativedelta(months=months) - timedelta(days=1)
        # Tronquer la dernière période à la date de fin du projet
        if current_end > horizon:
            current_end = horizon
        due = current_end + grace
        if n not in existing:
            periods.append(ReportingPeriod(
                project=project,
                period_number=n,
                start_date=current_start,
                end_date=current_end,
                due_date=due,
                label=fmt(current_start),
            ))
        current_start = current_end + timedelta(days=1)
        n += 1
        if n > 120:  # sécurité max 10 ans mensuel
            break

    ReportingPeriod.objects.bulk_create(periods, ignore_conflicts=True)
    return len(periods), None


# ---------------------------------------------------------------------------
# SF-5 — Moteur de mise à jour des statuts de périodes (deadline engine)
# ---------------------------------------------------------------------------

def refresh_period_statuses(project=None):
    """
    Met à jour le statut des ReportingPeriod en fonction de la date du jour.

    Transitions automatiques :
      upcoming  → open     si start_date <= today <= end_date
      upcoming  → overdue  si today > due_date  (période jamais ouverte)
      open      → overdue  si today > due_date

    Les statuts submitted et approved sont immuables — ils ne régressent
    jamais automatiquement (transition manuelle via PATCH uniquement).

    Paramètres :
      project : Project ou None.
                Si None, traite l'ensemble du portefeuille (appel cron).
                Si fourni, traite uniquement les périodes de ce projet
                (appel manuel depuis la vue ou les tests).

    Retourne : dict {updated: int, detail: {status: count}}
    """
    from datetime import date
    from apps.project.models import ReportingPeriod

    today = date.today()
    qs = ReportingPeriod.objects.all()
    if project is not None:
        qs = qs.filter(project=project)

    # On ne touche qu'aux statuts automatisables (pas submitted/approved)
    qs = qs.filter(status__in=["upcoming", "open"])

    updated = 0
    detail = {"open": 0, "overdue": 0}

    for period in qs.select_related("project"):
        new_status = None

        if today > period.due_date:
            # Deadline soumission dépassée → overdue
            new_status = "overdue"
        elif today > period.end_date:
            # Période terminée mais dans le délai de grâce → overdue aussi
            # (la fenêtre de collecte est fermée, les données sont en retard)
            new_status = "overdue"
        elif period.start_date <= today:
            # Période en cours → open
            new_status = "open"
        # Sinon : future → reste upcoming

        if new_status and new_status != period.status:
            period.status = new_status
            period.save(update_fields=["status"])
            updated += 1
            detail[new_status] = detail.get(new_status, 0) + 1

    return {"updated": updated, "detail": detail}


# ---------------------------------------------------------------------------
# SF-10 — Génération du workspace à Effective
# ---------------------------------------------------------------------------

def generate_workspace(project, actor):
    """
    Génère le workspace projet lors du passage à Effective (SF-10).
    Idempotent — ne crée rien si le workspace existe déjà.

    Actions :
      1. Crée ProjectWorkspace (sentinelle d'activation)
      2. Verrouille la ToC (status → locked)
      3. Marque m5_gis_ready si des zones GADM existent
      4. Génère le schedule de reporting si les prérequis sont là
      5. Marque m2_results_ready

    Retourne le workspace créé ou existant.
    """
    from apps.project.models import ProjectWorkspace

    # Idempotence
    workspace, created = ProjectWorkspace.objects.get_or_create(
        project=project,
        defaults={"activated_by": actor},
    )
    if not created:
        return workspace

    updates = []

    # 1. Verrouiller la ToC
    try:
        toc = project.theory_of_change
        if toc.status != "locked":
            toc.status = "locked"
            toc.save(update_fields=["status", "updated_at"])
        workspace.m2_results_ready = True
        updates.append("m2_results_ready")
    except Exception:
        pass

    # 2. GIS — vérifier que des zones GADM existent
    if project.gadm_scope.exists():
        workspace.m5_gis_ready = True
        updates.append("m5_gis_ready")

    # 3. Générer le schedule de reporting
    if project.reporting_frequency and project.next_reporting_due and project.end_date:
        try:
            count, error = generate_reporting_periods(project)
            if not error and count > 0:
                # Calculer immédiatement les statuts corrects (open/overdue/upcoming)
                # sans attendre le cron Celery de 02h00 UTC
                refresh_period_statuses(project=project)
        except Exception:
            pass

    # 4. Sauvegarder workspace
    if updates:
        workspace.save(update_fields=updates)

    return workspace

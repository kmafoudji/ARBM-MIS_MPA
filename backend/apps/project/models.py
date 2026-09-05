"""
Domaine project — table project et machine a etats du cycle de vie.
Aligne sur la SFD Module 1 :
  - SF-1 Etape 1 (Identite de base / Core ID)
  - SF-1 Etape 3 (Cycle de vie)
  - SF-2 (Alignement strategique & classification)
  - SF-4 (Gestion du cycle de vie — machine a etats 13 + 2 exceptions)

Non couvert dans cette passe (a construire plus tard) :
  - SF-1 Etape 2 : Theorie du Changement structuree (BRQ-1.35)
  - SF-1 Etape 5 : configuration du cycle de reporting (renvoie SF-5)
  - Extraction IA du PAD (BRQ-1.14) — le champ pad_reference_file existe,
    pas encore le pipeline d'extraction.
"""
from django.db import models

from .managers import ProjectQuerySet
from apps.identity.models import AppUser
from apps.reference.models import (
    Country,
    Currency,
    CrossCuttingTheme,
    Donor,
    RegionalHub,
    Sdg,
    Sector,
)


# SF-4 : machine a etats a 13 etapes + 2 etats d'exception
LIFECYCLE_STAGE_CHOICES = [
    # Pre-approbation
    ("concept_note", "Concept Note"),
    ("pipeline_taskforce_review", "Pipeline Taskforce Review"),
    ("pipeline_taskforce_approved", "Pipeline Taskforce Approved"),
    ("preparation_identification", "Preparation / Identification"),
    # Gates d'approbation (autorisation double)
    ("trc_endorsed", "TRC Endorsed"),
    ("ic_approved", "IC Approved"),
    # Mise en oeuvre (avant gate final)
    ("appraisal", "Appraisal"),
    ("bed_approved", "BED Approved"),
    ("effective", "Effective"),
    ("implementing", "Implementing"),
    ("mid_term_review", "Mid-Term Review"),
    # Cloture
    ("substantially_complete", "Substantially Complete"),
    ("closed", "Closed"),
    # Etats d'exception
    ("suspended", "Suspended (exception)"),
    ("cancelled", "Cancelled (exception)"),
]

# Ordre lineaire des 13 etapes nominales (hors exceptions) — utilise pour
# determiner si une transition est "avant" ou "arriere" (POL-1.09).
LIFECYCLE_ORDER = [
    "concept_note",
    "pipeline_taskforce_review",
    "pipeline_taskforce_approved",
    "preparation_identification",
    "trc_endorsed",
    "ic_approved",
    "appraisal",
    "bed_approved",
    "effective",
    "implementing",
    "mid_term_review",
    "substantially_complete",
    "closed",
]

# Gates d'approbation exigeant une autorisation double (RG-4.1, POL-1.09)
GATE_STAGES = {"trc_endorsed", "ic_approved", "bed_approved"}

EXCEPTION_STAGES = {"suspended", "cancelled"}

GENDER_MARKER_CHOICES = [
    ("0", "Category 0 — Not targeted"),
    ("1", "Category 1 — Significant"),
    ("2", "Category 2 — Principal"),
]

RIO_MARKER_CHOICES = [
    ("not_targeted", "Not targeted"),
    ("significant", "Significant"),
    ("principal", "Principal"),
]

IMPLEMENTATION_MODALITY_CHOICES = [
    ("direct", "Direct"),
    ("country_systems", "Country systems"),
    ("ngo", "NGO"),
    ("private", "Private"),
    ("multi_actor", "Multi-actor"),
    ("hybrid", "Hybrid"),
]

GEOGRAPHIC_TYPOLOGY_CHOICES = [
    ("urban", "Urban"),
    ("peri_urban", "Peri-urban"),
    ("rural", "Rural"),
    ("remote", "Remote"),
    ("mixed_multi_district", "Mixed / multi-district"),
]

FRAGILITY_STATUS_CHOICES = [
    ("fcv", "FCV"),
    ("pre_fcv", "Pre-FCV"),
    ("stable", "Stable"),
]

INVESTMENT_CYCLE_CHOICES = [
    ("LLF1", "LLF1"),
    ("LLF2", "LLF2"),
]

RISK_RATING_CHOICES = [
    ("low", "Low"),
    ("moderate", "Moderate"),
    ("substantial", "Substantial"),
    ("high", "High"),
]


class Project(models.Model):
    # --- SF-1 Etape 1 : Identite de base (Core ID) ---
    name = models.CharField(max_length=255, help_text="Obligatoire des Concept Note.")
    acronym = models.CharField(
        max_length=20, blank=True,
        help_text="Sigle court du projet (ex. PAAFS, WASH-IDN). Optionnel.",
    )
    code = models.CharField(
        max_length=30, unique=True, null=True, blank=True,
        help_text="Code projet interne — genere automatiquement a partir du pays chef "
        "de file, une fois les pays du projet connus (POL-1.05). Voir "
        "apps.project.services.generate_project_code().",
    )
    official_reference_number = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        help_text="Numero de reference officiel. Unicite controlee (rejet du doublon).",
    )
    investment_cycle = models.CharField(
        max_length=10, choices=INVESTMENT_CYCLE_CHOICES, null=True, blank=True,
        help_text="LLF investment cycle the project belongs to (LLF1 or LLF2).",
    )
    pad_reference_file = models.FileField(
        upload_to="pad/", null=True, blank=True,
        help_text="Declenche l'extraction IA (BRQ-1.14) si PDF lisible. "
        "TODO : brancher Azure Blob Storage en production (pas de base64).",
    )
    lifecycle_stage = models.CharField(
        max_length=30, choices=LIFECYCLE_STAGE_CHOICES, default="concept_note",
        help_text="13 etapes + 2 exceptions (SF-4).",
    )
    countries = models.ManyToManyField(
        Country, through="ProjectCountry", related_name="projects",
        help_text="Admin 0 (GADM). Multi-pays autorise (R13 revisee) — le montant "
        "financier n'est jamais ventile par pays (R20). Voir pays chef de file "
        "sur ProjectCountry.is_lead.",
    )

    # --- SF-2 : Alignement strategique & classification ---
    primary_sdg = models.ForeignKey(
        Sdg, on_delete=models.PROTECT, null=True, blank=True, related_name="projects_as_primary",
        help_text="ODD primaire (1 seul, obligatoire).",
    )
    contributing_sdgs = models.ManyToManyField(
        Sdg, through="ProjectSdg", related_name="projects", blank=True,
        help_text="ODD contributifs (0 ou plus).",
    )
    gender_marker = models.CharField(
        max_length=1, choices=GENDER_MARKER_CHOICES, null=True, blank=True,
        help_text="Marqueur OECD-DAC genre.",
    )
    rio_marker_mitigation = models.CharField(
        max_length=20, choices=RIO_MARKER_CHOICES, default="not_targeted"
    )
    rio_marker_adaptation = models.CharField(
        max_length=20, choices=RIO_MARKER_CHOICES, default="not_targeted"
    )
    rio_marker_biodiversity = models.CharField(
        max_length=20, choices=RIO_MARKER_CHOICES, default="not_targeted"
    )
    rio_marker_desertification = models.CharField(
        max_length=20, choices=RIO_MARKER_CHOICES, default="not_targeted"
    )
    rio_marker_water = models.CharField(
        max_length=20, choices=RIO_MARKER_CHOICES, default="not_targeted",
        help_text="OECD-DAC Rio Marker — Water (Objectif de Eau)."
    )
    cross_cutting_themes = models.ManyToManyField(
        CrossCuttingTheme, related_name="projects", blank=True
    )
    implementation_modality = models.CharField(
        max_length=20, choices=IMPLEMENTATION_MODALITY_CHOICES, null=True, blank=True
    )
    beneficiary_target_direct = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Cible beneficiaires directs (agrege — desagregation detaillee -> Module 6).",
    )
    beneficiary_target_indirect = models.PositiveIntegerField(null=True, blank=True)
    geographic_typology = models.CharField(
        max_length=30, choices=GEOGRAPHIC_TYPOLOGY_CHOICES, null=True, blank=True
    )
    fragility_status = models.CharField(
        max_length=10, choices=FRAGILITY_STATUS_CHOICES, null=True, blank=True,
        help_text="Revu annuellement (RG-4.2).",
    )
    risk_rating = models.CharField(
        max_length=15, choices=RISK_RATING_CHOICES, null=True, blank=True,
        help_text="Revu annuellement (RG-4.2).",
    )

    # --- Rattachements portefeuille (deja presents, complements) ---
    hub = models.ForeignKey(
        RegionalHub, on_delete=models.SET_NULL, null=True, blank=True, related_name="projects"
    )
    primary_sector = models.ForeignKey(
        Sector, on_delete=models.PROTECT, null=True, blank=True, related_name="projects_as_primary",
        help_text="Secteur primaire (obligatoire des Concept Note).",
    )
    contributing_sectors = models.ManyToManyField(
        Sector, through="ProjectSector", related_name="projects", blank=True,
        help_text="Secteurs contributifs (0 ou plus), sur le meme modele que les ODD.",
    )
    donors = models.ManyToManyField(Donor, related_name="projects", blank=True)

    budget_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, null=True, blank=True)

    # --- SF-1 Etape 3 : Cycle de vie ---
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    # --- SF-1 Etape 5 : Reporting (renvoie SF-5) ---
    # Perimetre volontairement reduit a ce qui est non ambigu dans le SFD.
    # La "chaine d'approbation" mentionnee par le SFD ("selection du cycle,
    # configuration des echeances et de la chaine d'approbation") releve du
    # RBAC/workflow (SF-3 / Module 7), pas d'un champ simple sur le projet —
    # laisse en question ouverte plutot que de deviner une structure.
    REPORTING_FREQUENCY_CHOICES = [
        ("quarterly", "Quarterly"),
        ("semi_annual", "Semi-annual"),
        ("annual", "Annual"),
    ]
    reporting_frequency = models.CharField(
        max_length=15, choices=REPORTING_FREQUENCY_CHOICES, null=True, blank=True
    )
    next_reporting_due = models.DateField(
        null=True, blank=True, help_text="Premiere echeance de reporting."
    )

    created_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="projects_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Manager par defaut inchange ; .in_scope(request) applique le perimetre
    # par role (row-level security) — voir core/scope.py et managers.py.
    objects = ProjectQuerySet.as_manager()

    class Meta:
        db_table = "project"

    @property
    def lead_country(self):
        pc = self.project_countries.filter(is_lead=True).select_related("country").first()
        return pc.country if pc else None

    def __str__(self):
        return f"{self.code or '(sans code)'} - {self.name}"


class ProjectCountry(models.Model):
    """
    Table de jonction N..N project <-> country (R13 revisee : multi-pays
    autorise, un seul pays chef de file pour l'affichage). Le montant
    financier reste au niveau projet, jamais ventile par pays (R20).
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_countries")
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="project_countries")
    is_lead = models.BooleanField(default=False)

    class Meta:
        db_table = "project_country"
        unique_together = ("project", "country")
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(is_lead=True),
                name="unique_lead_country_per_project",
            )
        ]

    def __str__(self):
        return f"{self.project} - {self.country}" + (" (chef de file)" if self.is_lead else "")


class ProjectSdg(models.Model):
    """Table de jonction N..N project <-> sdg (ODD contributifs)."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    sdg = models.ForeignKey(
        Sdg,
        on_delete=models.PROTECT,
        help_text="PROTECT et non CASCADE : supprimer un ODD effacerait "
        "silencieusement la classification des projets qui le portent en "
        "contributif. Cf. POL-1.07 (pas de suppression definitive).",
    )

    class Meta:
        db_table = "project_sdg"
        unique_together = ("project", "sdg")


class ProjectSector(models.Model):
    """Table de jonction N..N project <-> sector (secteurs contributifs)."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    sector = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        help_text="PROTECT et non CASCADE : voir ProjectSdg.sdg.",
    )

    class Meta:
        db_table = "project_sector"
        unique_together = ("project", "sector")


class ProjectStageTransition(models.Model):
    """
    Piste d'audit immuable des transitions d'etape (RG-4.1, BRQ-1.20).
    Une ligne par transition : identite, horodatage, justification,
    reference documentaire, preuve d'autorisation double le cas echeant.
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="stage_transitions")
    from_stage = models.CharField(max_length=30, choices=LIFECYCLE_STAGE_CHOICES)
    to_stage = models.CharField(max_length=30, choices=LIFECYCLE_STAGE_CHOICES)
    transitioned_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="stage_transitions_made"
    )
    transitioned_at = models.DateTimeField(auto_now_add=True)
    transition_date = models.DateField(
        null=True, blank=True,
        help_text="Date effective du passage d'etape (peut differer de la date de saisie).",
    )
    justification = models.TextField(
        blank=True, help_text="Obligatoire pour tout retour arriere (POL-1.09)."
    )
    document_reference = models.CharField(max_length=255, blank=True)
    dual_authorized_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="stage_transitions_coauthorized",
        help_text="Second approbateur — requis pour les gates (TRC/IC/BED) et tout retour arriere.",
    )

    class Meta:
        db_table = "project_stage_transition"
        ordering = ["-transitioned_at"]

    def __str__(self):
        return f"{self.project.code} : {self.from_stage} -> {self.to_stage}"


# ---------------------------------------------------------------------------
# SF-6 — Enveloppe financière (financement mixte)
# ---------------------------------------------------------------------------
# Le LLF combine des sources heterogenes (prets IsDB, dons de bailleurs,
# contreparties gouvernementales) dans un seul fonds fiduciaire.
# Un champ budget_amount plat ne peut pas representer cette structure —
# c'est precisement la lacune qui rendait les chiffres du portefeuille
# ambigus ("IsDB 1.0B" confondait prets et dons).
#
# Architecture : chaque ligne FinancingSource capture une source/instrument,
# les lignes sont sommees par ProjectFinancialEnvelope.total_amount_usd.
# Le budget d'execution detaille reste au Module 9 ; ici on capture
# l'enveloppe indicative a la configuration (BRQ-1.31).
# ---------------------------------------------------------------------------

FINANCING_SOURCE_CHOICES = [
    ("isdb_oc",       "IsDB Ordinary Capital"),
    ("llf",           "LLF (multi-donor trust fund)"),
    ("government",    "Government / national counterpart"),
    ("co_financing",  "Co-financing"),
]

FINANCING_INSTRUMENT_CHOICES = [
    ("loan",          "Loan"),
    ("grant",         "Grant"),
    ("counterpart",   "Counterpart"),
    ("co_financing",  "Co-financing"),
]

COMPONENT_CHOICES = [
    ("works",         "Works"),
    ("consulting",    "Consulting"),
    ("goods",         "Goods"),
    ("training",      "Training"),
    ("operating",     "Operating costs"),
]


class ProjectFinancialEnvelope(models.Model):
    """
    Enveloppe financiere globale d'un projet (SF-6).

    Relation 1:1 avec Project : creee automatiquement au passage a
    l'etape IC Approved, ou plus tot si le LLFMU saisit les donnees
    en anticipation.

    Le champ total_amount_usd est CALCULE (propriete Python) plutot
    que stocke : il reflete en temps reel la somme des FinancingSource
    et ne peut pas diverger. Jamais ventile par pays (R20/R21).
    """

    project = models.OneToOneField(
        "Project",
        on_delete=models.CASCADE,
        related_name="financial_envelope",
    )
    notes = models.TextField(
        blank=True,
        help_text="Remarques libres sur la structure de financement.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envelopes_updated",
    )

    class Meta:
        db_table = "project_financial_envelope"

    @property
    def total_amount_usd(self):
        """Somme des lignes de financement en USD. Calcule, jamais stocke."""
        from django.db.models import Sum
        result = self.financing_sources.aggregate(total=Sum("amount_usd"))
        return result["total"] or 0

    def __str__(self):
        return f"Enveloppe {self.project.code}"


class FinancingSource(models.Model):
    """
    Une ligne de financement : source x instrument x montant x devise.

    La conversion vers USD (amount_usd) est effectuee au moment de la
    saisie. En l'absence d'un flux de taux de change en temps reel,
    la valeur est saisie par l'utilisateur avec la date de reference.
    Un service de conversion automatique pourra etre branche ulterieurement
    sans changer le schema (le champ amount_usd reste la valeur cible).
    """

    envelope = models.ForeignKey(
        ProjectFinancialEnvelope,
        on_delete=models.CASCADE,
        related_name="financing_sources",
    )
    source = models.CharField(
        max_length=20,
        choices=FINANCING_SOURCE_CHOICES,
        help_text="Source de financement selon le vocabulaire LLF2.",
    )
    instrument = models.CharField(
        max_length=20,
        choices=FINANCING_INSTRUMENT_CHOICES,
        help_text="Type d'instrument financier.",
    )
    donor = models.ForeignKey(
        "reference.Donor",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="financing_contributions",
        help_text="Bailleur associe, si applicable (optionnel pour les lignes IsDB OC).",
    )
    amount = models.DecimalField(
        max_digits=16,
        decimal_places=2,
        help_text="Montant dans la devise d'origine.",
    )
    currency = models.ForeignKey(
        "reference.Currency",
        on_delete=models.PROTECT,
        help_text="Devise d'origine.",
    )
    amount_usd = models.DecimalField(
        max_digits=16,
        decimal_places=2,
        help_text="Equivalent USD. Saisi manuellement avec la date de reference "
        "tant qu'aucun flux de taux de change n'est branche.",
    )
    exchange_rate_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date a laquelle le taux de change a ete applique.",
    )
    label = models.CharField(
        max_length=200,
        blank=True,
        help_text="Libelle libre, ex. 'Pret IsDB tranche 1'.",
    )
    order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Ordre d'affichage dans le tableau de financement.",
    )

    class Meta:
        db_table = "financing_source"
        ordering = ["order", "pk"]

    def __str__(self):
        return f"{self.get_source_display()} / {self.get_instrument_display()} — {self.amount_usd:,.0f} USD"


class ComponentAllocation(models.Model):
    """
    Allocation indicative par composante (SF-6, champ optionnel).

    Works / Consulting / Goods / Training / Operating costs.
    Indicatif uniquement — le detail reste au Module 9.
    La somme des allocations DOIT etre egale a total_amount_usd
    (controle applicatif, pas de contrainte DB car les valeurs sont
    indicatives et peuvent etre saisies progressivement).
    """

    envelope = models.ForeignKey(
        ProjectFinancialEnvelope,
        on_delete=models.CASCADE,
        related_name="component_allocations",
    )
    component = models.CharField(
        max_length=20,
        choices=COMPONENT_CHOICES,
    )
    amount_usd = models.DecimalField(
        max_digits=16,
        decimal_places=2,
        help_text="Allocation indicative en USD.",
    )

    class Meta:
        db_table = "component_allocation"
        unique_together = ("envelope", "component")
        ordering = ["component"]

    def __str__(self):
        return f"{self.get_component_display()} : {self.amount_usd:,.0f} USD"


# ---------------------------------------------------------------------------
# SF-3 — Partenaires d'exécution (Implementing Partners)
# ---------------------------------------------------------------------------
# Capture les agences d'exécution affectées au projet et leur allocation
# budgétaire indicative. Précurseur de SF-3 complet (provisioning RBAC)
# qui sera activé ultérieurement.
# ---------------------------------------------------------------------------

PARTNER_ROLE_CHOICES = [
    ("lead",              "Lead Implementing Agency"),
    ("co_executor",       "Co-executing Agency"),
    ("technical_partner", "Technical Partner"),
    ("fiduciary",         "Fiduciary Agent"),
    ("subcontract",       "Subcontractor / Service provider"),
    ("ngo",               "NGO / Civil society"),
    ("government",        "Government entity"),
    ("un_agency",         "UN Agency"),
    ("private_sector",    "Private sector"),
    ("research",          "Research / Academic institution"),
]


class ProjectImplementingPartner(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="implementing_partners",
    )
    agency = models.ForeignKey(
        "reference.ImplementingAgency",
        on_delete=models.PROTECT,
        related_name="project_assignments",
        help_text="Agence d'exécution issue du référentiel.",
    )
    role = models.CharField(
        max_length=20,
        choices=PARTNER_ROLE_CHOICES,
        default="lead",
        help_text="Rôle de l'agence dans le projet.",
    )
    allocated_amount_usd = models.DecimalField(
        max_digits=16,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Montant délégué en USD (indicatif — budget détaillé au Module 9).",
    )
    notes = models.TextField(
        blank=True,
        help_text="Remarques libres (périmètre d'intervention, composantes couvertes…).",
    )
    focal_point_name = models.CharField(
        max_length=150, blank=True,
        help_text="Nom du point focal pour ce projet.",
    )
    focal_point_email = models.EmailField(
        blank=True,
        help_text="Email du point focal.",
    )
    focal_point_phone = models.CharField(
        max_length=30, blank=True,
        help_text="Téléphone du point focal.",
    )
    order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Ordre d'affichage.",
    )

    class Meta:
        db_table = "project_implementing_partner"
        ordering = ["order", "pk"]
        constraints = [
            # Un seul Lead par projet
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(role="lead"),
                name="unique_lead_partner_per_project",
            )
        ]

    def __str__(self):
        return f"{self.agency.name} ({self.get_role_display()}) — {self.project.code}"


# ---------------------------------------------------------------------------
# SF-7 — Périmètre géographique GADM (zones infra-nationales)
# ---------------------------------------------------------------------------

class ProjectGadmScope(models.Model):
    """
    Zone géographique d'intervention d'un projet au niveau Admin 1 ou 2.
    Un projet peut couvrir plusieurs zones (multi-provinces, multi-districts).
    Héritée par M5 (cartographie) lors de la génération du workspace (SF-10).
    """
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="gadm_scope",
    )
    area = models.ForeignKey(
        "reference.GadmArea",
        on_delete=models.PROTECT,
        related_name="project_scopes",
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Zone principale d'intervention (affichage prioritaire sur les cartes).",
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "project_gadm_scope"
        unique_together = [("project", "area")]
        ordering = ["-is_primary", "area__level", "area__name"]

    def __str__(self):
        return f"{self.project.code} — {self.area.name} (L{self.area.level})"


# ---------------------------------------------------------------------------
# SF-5 — Périodes de reporting (génération automatique)
# ---------------------------------------------------------------------------

REPORTING_PERIOD_STATUS_CHOICES = [
    ("upcoming",   "Upcoming"),
    ("open",       "Open"),
    ("submitted",  "Submitted"),
    ("approved",   "Approved"),
    ("overdue",    "Overdue"),
]


class ReportingPeriod(models.Model):
    """
    Période de reporting générée automatiquement à partir de la fréquence
    et de la première échéance du projet (SF-5).
    Générée lors du passage à Effective (SF-10) ou manuellement via
    POST /api/projects/<pk>/reporting-periods/generate/.
    """
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="reporting_periods",
    )
    period_number = models.PositiveSmallIntegerField(
        help_text="Numéro séquentiel de la période (1, 2, 3…)."
    )
    start_date = models.DateField()
    end_date   = models.DateField()
    due_date   = models.DateField(
        help_text="Date limite de soumission (fin de période + délai de grâce)."
    )
    status = models.CharField(
        max_length=15,
        choices=REPORTING_PERIOD_STATUS_CHOICES,
        default="upcoming",
    )
    label = models.CharField(
        max_length=50, blank=True,
        help_text="Ex. 'Q1 2026', 'S2 2026', 'Annual 2026'."
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reporting_period"
        ordering = ["period_number"]
        unique_together = [("project", "period_number")]

    @property
    def is_late(self):
        """
        Vrai si la période a été soumise après sa date limite (due_date).
        Dérivé de submitted_at : aucun statut supplémentaire n'est stocké,
        « Submitted (late) » reste un submitted/approved ordinaire.
        """
        if self.status not in ("submitted", "approved") or not self.submitted_at:
            return False
        return self.submitted_at.date() > self.due_date

    def __str__(self):
        return f"{self.project.code} — {self.label or f'P{self.period_number}'}"


# ---------------------------------------------------------------------------
# SF-10 — Workspace projet (généré au passage à Effective)
# ---------------------------------------------------------------------------

class ProjectWorkspace(models.Model):
    """
    Enregistrement sentinelle créé automatiquement lors du passage à
    Effective (SF-10). Marque l'activation du projet et sert de point
    d'entrée pour les modules aval (M2, M3, M5, M6, M9, M11, M13).
    Un seul workspace par projet — OneToOne.
    """
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="workspace",
    )
    activated_at = models.DateTimeField(auto_now_add=True)
    activated_by = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True,
        related_name="workspaces_activated",
    )
    # Checklist de génération — chaque clé devient True une fois le
    # module aval instancié (rempli progressivement à mesure que les
    # modules sont construits).
    m2_results_ready   = models.BooleanField(default=False, help_text="ToC verrouillée, Logframe initialisé.")
    m3_workplan_ready  = models.BooleanField(default=False, help_text="Workplan skeleton créé.")
    m5_gis_ready       = models.BooleanField(default=False, help_text="Périmètre GIS hérité de SF-7.")
    m6_beneficiary_ready = models.BooleanField(default=False, help_text="Scaffold bénéficiaires créé.")
    m9_risk_ready      = models.BooleanField(default=False, help_text="Registre de risques amorcé.")
    m11_dashboard_ready = models.BooleanField(default=False, help_text="Dashboards par défaut créés.")
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "project_workspace"

    def __str__(self):
        return f"Workspace — {self.project.code}"

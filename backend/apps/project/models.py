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
    ("0", "Categorie 0 - Non cible"),
    ("1", "Categorie 1 - Significatif"),
    ("2", "Categorie 2 - Principal"),
]

RIO_MARKER_CHOICES = [
    ("not_targeted", "Non cible"),
    ("significant", "Significatif"),
    ("principal", "Principal"),
]

IMPLEMENTATION_MODALITY_CHOICES = [
    ("direct", "Directe"),
    ("country_systems", "Systemes pays"),
    ("ngo", "ONG"),
    ("private", "Prive"),
    ("multi_actor", "Multi-acteurs"),
    ("hybrid", "Hybride"),
]

GEOGRAPHIC_TYPOLOGY_CHOICES = [
    ("urban", "Urbain"),
    ("peri_urban", "Peri-urbain"),
    ("rural", "Rural"),
    ("remote", "Recule"),
    ("mixed_multi_district", "Mixte multi-districts"),
]

FRAGILITY_STATUS_CHOICES = [
    ("fcv", "FCV"),
    ("pre_fcv", "Pre-FCV"),
    ("stable", "Stable"),
]

RISK_RATING_CHOICES = [
    ("low", "Faible"),
    ("moderate", "Modere"),
    ("substantial", "Substantiel"),
    ("high", "Eleve"),
]


class Project(models.Model):
    # --- SF-1 Etape 1 : Identite de base (Core ID) ---
    name = models.CharField(max_length=255, help_text="Obligatoire des Concept Note.")
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
    sector = models.ForeignKey(Sector, on_delete=models.PROTECT, related_name="projects")
    donors = models.ManyToManyField(Donor, related_name="projects", blank=True)

    budget_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, null=True, blank=True)

    # --- SF-1 Etape 3 : Cycle de vie ---
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    created_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="projects_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    sdg = models.ForeignKey(Sdg, on_delete=models.CASCADE)

    class Meta:
        db_table = "project_sdg"
        unique_together = ("project", "sdg")


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

"""
Domaine results — Module 2 : Results Framework & Indicators.

Architecture (v2 — complétée SF-1/SF-2/SF-3) :
  Indicator        — bibliothèque centralisée LLF2 (SF-1)
                     Ajouts : aggregation_rule, chain_level, cross_cutting_tags, version
  TheoryOfChange   — ToC structurée (SF-2)
                     Ajout : local_actors
  ToCNode          — nœuds de la chaîne causale (SF-2)
                     Ajouts : niveau ultimate, liaisons cross-pathway N→N
  LogframeRow      — ligne du cadre logique par projet
  LogframeTarget   — cibles par période (SF-3)
                     Ajouts : statut workflow, cible PAD originale, révision auditable
  TargetRevision   — historique immuable des révisions de cibles (SF-3, RG-3.3/3.4)
"""
from django.db import models

from apps.identity.models import AppUser
from apps.project.models import Project
from apps.reference.models import Sdg, Sector

# ---------------------------------------------------------------------------
# Vocabulaires partagés
# ---------------------------------------------------------------------------

TOC_STATUS_CHOICES = [
    ("draft",   "Draft"),
    ("active",  "Active"),
    ("locked",  "Locked — Effective (SF-10)"),
]

# SF-2 RG-2.1 — 5 niveaux de chaîne (+ ultimate porté par TheoryOfChange.ultimate_outcome)
CHAIN_LEVEL_CHOICES = [
    ("activity",              "Activity"),
    ("output",                "Output"),
    ("immediate_outcome",     "Immediate outcome"),
    ("intermediate_outcome",  "Intermediate outcome"),
    ("ultimate_outcome",      "Ultimate outcome"),
]

# Logframe inclut impact comme niveau de synthèse hors ToC
CHAIN_LEVEL_WITH_IMPACT_CHOICES = CHAIN_LEVEL_CHOICES + [("impact", "Impact")]

PARENT_LEVEL = {
    "activity":             None,
    "output":               "activity",
    "immediate_outcome":    "output",
    "intermediate_outcome": "immediate_outcome",
    "ultimate_outcome":     "intermediate_outcome",
}

INDICATOR_TYPE_CHOICES = [
    ("numeric",     "Numeric"),
    ("percentage",  "Percentage"),
    ("yes_no",      "Yes / No"),
    ("count",       "Count"),
]

DIRECTION_CHOICES = [
    ("increase", "Upward (+)"),
    ("decrease", "Downward (-)"),
    ("neutral",  "Neutral"),
]

MEASUREMENT_FREQUENCY_CHOICES = [
    ("monthly",       "Monthly"),
    ("quarterly",     "Quarterly"),
    ("semi_annual",   "Semi-annual"),
    ("annual",        "Annual"),
    ("end_of_project","End of project"),
]

# SF-1 BRQ-2.02 — règle d'agrégation par indicateur
AGGREGATION_RULE_CHOICES = [
    ("sum",              "Sum"),
    ("average",          "Average"),
    ("weighted_average", "Weighted average"),
    ("ratio",            "Ratio"),
    ("last_value",       "Last value"),
    ("maximum",          "Maximum"),
]

# SF-1 — tags transversaux (cross-cutting themes)
CROSS_CUTTING_TAG_CHOICES = [
    ("gender",      "Gender"),
    ("climate",     "Climate"),
    ("youth",       "Youth"),
    ("disability",  "Disability"),
    ("idp_refugee", "IDP / Refugee"),
    ("equity",      "Equity"),
]

# SF-3 — statut d'une cible
TARGET_STATUS_CHOICES = [
    ("draft",    "Draft"),
    ("approved", "Approved"),
    ("revised",  "Revised"),
]


# ---------------------------------------------------------------------------
# SF-1 — Bibliothèque centralisée d'indicateurs
# ---------------------------------------------------------------------------

class Indicator(models.Model):
    """
    Catalogue institutionnel LLF2. Géré par LLFMU uniquement (POL-2.01).

    v2 — ajouts SF-1 :
      aggregation_rule  : règle de roll-up portefeuille (BRQ-2.02)
      chain_level       : niveau de chaîne de l'indicateur (BRQ-2.02)
      cross_cutting_tags: tags Genre/Climat/Jeunes… (BRQ-2.02)
      version           : versionnement (RG-1.1) — entier auto-incrémenté
    """

    code    = models.CharField(max_length=20, unique=True)
    sector  = models.ForeignKey(Sector, on_delete=models.PROTECT, related_name="indicators")
    subsector = models.CharField(max_length=150, blank=True)
    name    = models.TextField()

    # SF-1 : type étendu aux 4 types SFD (BRQ-2.02)
    indicator_type = models.CharField(
        max_length=15, choices=INDICATOR_TYPE_CHOICES, default="numeric"
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)

    definition         = models.TextField()
    unit               = models.CharField(max_length=100)
    numerator          = models.TextField(blank=True)
    denominator        = models.TextField(blank=True)
    calculation_method = models.TextField(blank=True)
    formula            = models.TextField(blank=True)
    data_source        = models.TextField(blank=True)
    collection_method  = models.TextField(blank=True)
    reporting_frequency = models.CharField(
        max_length=15, choices=MEASUREMENT_FREQUENCY_CHOICES, blank=True
    )
    means_of_verification = models.TextField(blank=True)
    responsible           = models.CharField(max_length=200, blank=True)
    assumptions           = models.TextField(blank=True)
    limitations           = models.TextField(blank=True)
    related_sdgs = models.ManyToManyField(Sdg, blank=True, related_name="indicators")

    # ── Nouveaux champs SF-1 ──────────────────────────────────────────────
    aggregation_rule = models.CharField(
        max_length=20, choices=AGGREGATION_RULE_CHOICES, default="sum",
        help_text="Règle de roll-up Site→Projet→Portefeuille (BRQ-2.02).",
    )
    chain_level = models.CharField(
        max_length=25, choices=CHAIN_LEVEL_CHOICES, blank=True,
        help_text="Niveau de chaîne auquel cet indicateur est attaché (BRQ-2.02).",
    )
    cross_cutting_tags = models.JSONField(
        default=list, blank=True,
        help_text="Tags transversaux : Genre, Climat, Jeunes, Handicap, IDP/Réfugié, Équité.",
    )
    version = models.PositiveIntegerField(
        default=1,
        help_text="Numéro de version. Auto-incrémenté à chaque modification validée (RG-1.1).",
    )
    # ─────────────────────────────────────────────────────────────────────

    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "indicator"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name[:60]}"

    def bump_version(self):
        """Incrémente la version et sauvegarde (RG-1.1)."""
        self.version += 1
        self.save(update_fields=["version", "updated_at"])


# ---------------------------------------------------------------------------
# SF-2 — Théorie du Changement
# ---------------------------------------------------------------------------

class TheoryOfChange(models.Model):
    """
    ToC comme objet de première classe (SF-2, BRQ-2.06).

    v2 — ajout :
      local_actors : acteurs locaux ayant participé à l'élaboration (BRQ-2.06b).
    """

    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="theory_of_change"
    )
    version          = models.PositiveIntegerField(default=1)
    status           = models.CharField(max_length=20, choices=TOC_STATUS_CHOICES, default="draft")
    problem_statement = models.TextField(blank=True)
    ultimate_outcome  = models.TextField(blank=True)

    # ── Nouveau champ SF-2 ────────────────────────────────────────────────
    local_actors = models.TextField(
        blank=True,
        help_text="Acteurs locaux ayant participé à l'élaboration de la ToC (BRQ-2.06b).",
    )
    # ─────────────────────────────────────────────────────────────────────

    created_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True,
        related_name="theories_of_change_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "theory_of_change"

    def __str__(self):
        return f"ToC - {self.project.code or self.project.name}"


class ToCNode(models.Model):
    """
    Nœud de la chaîne causale (SF-2).

    v2 — ajouts :
      cross_pathways : liaisons N→N vers d'autres nœuds (pathways non linéaires, RG-2.6).
      Le niveau ultimate_outcome est maintenant dans CHAIN_LEVEL_CHOICES.
    """

    toc    = models.ForeignKey(TheoryOfChange, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    code        = models.CharField(max_length=20, blank=True, editable=False)
    chain_level = models.CharField(max_length=25, choices=CHAIN_LEVEL_CHOICES)
    statement   = models.TextField()

    logframe_row = models.ForeignKey(
        "LogframeRow", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="toc_nodes"
    )

    means_of_verification = models.TextField(blank=True)
    assumptions           = models.TextField(blank=True)
    risks_mitigation      = models.TextField(blank=True)
    adaptation_strategy   = models.TextField(blank=True)
    gender_climate_tag    = models.CharField(max_length=100, blank=True)

    # ── Nouveau champ SF-2 (RG-2.6) ──────────────────────────────────────
    cross_pathways = models.ManyToManyField(
        "self", blank=True, symmetrical=False,
        related_name="incoming_pathways",
        help_text="Liaisons non linéaires vers d'autres nœuds de la chaîne (RG-2.6).",
    )
    # ─────────────────────────────────────────────────────────────────────

    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "toc_node"
        ordering = ["chain_level", "order", "id"]

    def __str__(self):
        return f"{self.code} - {self.statement[:40]}"


# ---------------------------------------------------------------------------
# Logframe
# ---------------------------------------------------------------------------

class LogframeRow(models.Model):
    """
    Ligne du cadre logique — source de vérité pour indicateur + projet + nœud.
    """

    project   = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="logframe_rows")
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="logframe_rows")
    chain_level = models.CharField(max_length=25, choices=CHAIN_LEVEL_WITH_IMPACT_CHOICES)

    baseline_value  = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    baseline_year   = models.PositiveIntegerField(null=True, blank=True)
    baseline_source = models.TextField(blank=True)

    measurement_frequency = models.CharField(
        max_length=15, choices=MEASUREMENT_FREQUENCY_CHOICES, blank=True
    )
    notes     = models.TextField(blank=True)
    order     = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table    = "logframe_row"
        ordering    = ["chain_level", "order", "id"]
        unique_together = [("project", "indicator")]

    def __str__(self):
        return f"{self.project.code} | {self.indicator.code}"


# ---------------------------------------------------------------------------
# SF-3 — Cibles et révision adaptative
# ---------------------------------------------------------------------------

class LogframeTarget(models.Model):
    """
    Cible par période pour une ligne logframe (SF-3).

    v2 — ajouts SF-3 :
      status          : Draft / Approved / Revised (RG-3.3)
      is_original_pad : True = cible PAD originale, jamais modifiable (RG-3.4)
      approved_by     : approbateur LLFMU (RG-3.5)
      approved_at     : horodatage d'approbation
    """

    logframe_row = models.ForeignKey(
        LogframeRow, on_delete=models.CASCADE, related_name="targets"
    )
    target_value = models.DecimalField(max_digits=18, decimal_places=4)
    target_date  = models.DateField()
    label        = models.CharField(max_length=50, blank=True)
    disaggregation_note = models.TextField(blank=True)

    # ── Nouveaux champs SF-3 ─────────────────────────────────────────────
    status = models.CharField(
        max_length=10, choices=TARGET_STATUS_CHOICES, default="draft",
        help_text="Statut de la cible : Draft (en cours) / Approved (officielle) / Revised (remplacée).",
    )
    is_original_pad = models.BooleanField(
        default=False,
        help_text="True = cible issue du PAD. Jamais écrasée, toujours consultable (RG-3.4).",
    )
    approved_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="targets_approved",
        help_text="Approbateur LLFMU/IsDB (RG-3.5).",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    # ─────────────────────────────────────────────────────────────────────

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "logframe_target"
        ordering = ["target_date"]

    def __str__(self):
        pad = " [PAD]" if self.is_original_pad else ""
        return f"{self.logframe_row} → {self.target_value} ({self.target_date}){pad}"


class TargetRevision(models.Model):
    """
    Historique immuable des révisions de cibles (SF-3, RG-3.3 / RG-3.4).

    Créé automatiquement quand une cible Approved est modifiée :
      - l'ancienne cible passe à status='revised'
      - une nouvelle LogframeTarget est créée (status='approved' après workflow)
      - une entrée TargetRevision capture la justification et l'approbateur

    La cible originale PAD (is_original_pad=True) ne génère JAMAIS de révision :
    elle est figée pour toujours et sert de référence de comparaison.
    """

    target = models.ForeignKey(
        LogframeTarget, on_delete=models.CASCADE, related_name="revisions",
        help_text="Nouvelle cible résultant de la révision.",
    )
    previous_value = models.DecimalField(
        max_digits=18, decimal_places=4,
        help_text="Valeur de la cible avant révision.",
    )
    previous_date = models.DateField(
        help_text="Date cible avant révision.",
    )
    justification = models.TextField(
        help_text="Justification narrative obligatoire (RG-3.3).",
    )
    revised_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True,
        related_name="target_revisions_initiated",
    )
    approved_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="target_revisions_approved",
        help_text="Approbateur LLFMU/IsDB (RG-3.5).",
    )
    revision_status = models.CharField(
        max_length=15,
        choices=[
            ("pending",  "Pending approval"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
        ],
        default="pending",
    )
    revision_comment = models.TextField(
        blank=True,
        help_text="Commentaire de l'approbateur (obligatoire si rejet).",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "target_revision"
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"Revision {self.target.logframe_row} "
            f"{self.previous_value}→{self.target.target_value} ({self.revision_status})"
        )


# ---------------------------------------------------------------------------
# SF-4 / SF-5 — Saisie des valeurs réelles et scoring RAG
# ---------------------------------------------------------------------------

RESULTS_DATA_STATUS_CHOICES = [
    ("draft",    "Draft"),
    ("approved", "Approved"),
]

RAG_CHOICES = [
    ("green",  "On track (≥ 90%)"),
    ("amber",  "At risk (60–89%)"),
    ("red",    "Off track (< 60%)"),
    ("na",     "N/A — no target for this period"),
]


class ResultsData(models.Model):
    """
    Valeur réelle saisie pour un indicateur sur une période de reporting.

    Une entrée par (logframe_row, reporting_period) — contrainte unique.
    Le scoring RAG est calculé automatiquement à la sauvegarde via
    compute_rag() : actual_value / target_value la plus proche antérieure.

    Workflow simplifié (RBAC neutralisé) : Draft → Approved directement.
    La machine à états complète (PMU → Hub → LLFMU) sera branchée avec RBAC.
    """
    from apps.project.models import ReportingPeriod as _RP  # import local

    logframe_row = models.ForeignKey(
        LogframeRow,
        on_delete=models.CASCADE,
        related_name="results_data",
    )
    reporting_period = models.ForeignKey(
        "project.ReportingPeriod",
        on_delete=models.CASCADE,
        related_name="results_data",
    )

    actual_value = models.DecimalField(
        max_digits=18, decimal_places=4,
        help_text="Valeur réelle observée pour cette période.",
    )
    narrative = models.TextField(
        blank=True,
        help_text="Commentaire qualitatif sur la valeur (contexte, difficultés, leçons).",
    )

    # RAG calculé automatiquement
    rag_status = models.CharField(
        max_length=6, choices=RAG_CHOICES, default="na",
        help_text="Scoring automatique : actual / target la plus proche.",
    )
    achievement_rate = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Taux d'atteinte en % (actual / target × 100).",
    )

    # Workflow
    status = models.CharField(
        max_length=10, choices=RESULTS_DATA_STATUS_CHOICES, default="draft",
    )
    submitted_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="results_submitted",
    )
    approved_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="results_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table       = "results_data"
        ordering       = ["reporting_period__period_number", "logframe_row__order"]
        unique_together = [("logframe_row", "reporting_period")]

    def __str__(self):
        return (
            f"{self.logframe_row.indicator.code} | "
            f"{self.reporting_period.label} | "
            f"{self.actual_value} [{self.rag_status}]"
        )

    def compute_and_save_rag(self):
        """
        Calcule le taux d'atteinte et le statut RAG puis sauvegarde.

        Logique :
          - Cherche la cible approuvée dont la date est la plus proche
            (≤ end_date de la période, sinon la première disponible).
          - Si aucune cible → rag_status = 'na'.
          - Vert ≥ 90 %, Ambre 60–89 %, Rouge < 60 %.
          - Pour les indicateurs "decrease" : logique inversée.
        """
        from decimal import Decimal

        period_end = self.reporting_period.end_date
        targets = (
            self.logframe_row.targets
            .filter(status="approved")
            .order_by("target_date")
        )
        # Cible la plus proche ≤ end_date, sinon première disponible
        target = (
            targets.filter(target_date__lte=period_end).last()
            or targets.first()
        )

        if not target or target.target_value == 0:
            self.rag_status       = "na"
            self.achievement_rate = None
        else:
            direction = self.logframe_row.indicator.direction
            rate = (self.actual_value / target.target_value) * Decimal("100")

            if direction == "decrease":
                # Pour les indicateurs en baisse : actual ≤ target = bon
                rate = (target.target_value / self.actual_value) * Decimal("100") if self.actual_value else Decimal("0")

            self.achievement_rate = rate.quantize(Decimal("0.01"))
            if rate >= 90:
                self.rag_status = "green"
            elif rate >= 60:
                self.rag_status = "amber"
            else:
                self.rag_status = "red"

        self.save(update_fields=["rag_status", "achievement_rate"])


# ---------------------------------------------------------------------------
# SF-6 — Désagrégation structurée
# ---------------------------------------------------------------------------

class IndicatorDisaggregation(models.Model):
    """
    Dimension de désagrégation configurable par indicateur (LLFMU).

    Exemples :
      Indicateur AGR-001 → dimensions : Sexe ["Homme","Femme","Non précisé"]
                                        Âge  ["<18","18-35","36-60","60+"]
    """
    indicator  = models.ForeignKey(
        Indicator, on_delete=models.CASCADE,
        related_name="disaggregation_dimensions",
    )
    name       = models.CharField(max_length=100, help_text="Ex. Sexe, Âge, Localisation.")
    categories = models.JSONField(
        default=list,
        help_text='Liste ordonnée des catégories. Ex. ["Homme","Femme","Non précisé"].',
    )
    order      = models.PositiveIntegerField(default=0)

    class Meta:
        db_table   = "indicator_disaggregation"
        ordering   = ["order", "id"]
        unique_together = [("indicator", "name")]

    def __str__(self):
        return f"{self.indicator.code} — {self.name}"


class DisaggregationValue(models.Model):
    """
    Valeur saisie pour une catégorie d'une dimension de désagrégation,
    liée à un enregistrement ResultsData.

    La somme des valeurs d'une dimension doit être ≤ actual_value
    (avertissement, non bloquant — POL-2.04).
    """
    results_data = models.ForeignKey(
        ResultsData, on_delete=models.CASCADE,
        related_name="disaggregation_values",
    )
    dimension = models.ForeignKey(
        IndicatorDisaggregation, on_delete=models.CASCADE,
        related_name="values",
    )
    category = models.CharField(max_length=100)
    value    = models.DecimalField(max_digits=18, decimal_places=4)

    class Meta:
        db_table      = "disaggregation_value"
        unique_together = [("results_data", "dimension", "category")]
        ordering      = ["dimension__order", "category"]

    def __str__(self):
        return f"{self.results_data} | {self.dimension.name}: {self.category} = {self.value}"


# ---------------------------------------------------------------------------
# SF-9 — Scoring qualité des données (Data Quality Score)
# BRQ-2.23a / BRQ-2.23b
# ---------------------------------------------------------------------------

class DQScoreSnapshot(models.Model):
    """
    Instantané du score de qualité des données par indicateur et par période.
    Recalculé à chaque approbation ou fin de période.

    Score composite 0–100 % pondéré :
      Complétude  30 % — rapports reçus vs attendus
      Ponctualité 25 % — soumissions dans les délais
      Cohérence   25 % — écarts vs tendance historique
      Exactitude  20 % — preuves vérifiées (SF-10, placeholder)
    """
    logframe_row     = models.ForeignKey(
        LogframeRow, on_delete=models.CASCADE,
        related_name="dq_snapshots",
    )
    reporting_period = models.ForeignKey(
        "project.ReportingPeriod", on_delete=models.CASCADE,
        related_name="dq_snapshots", null=True, blank=True,
        help_text="Null = score global du projet (toutes périodes).",
    )
    # Dimensions
    completeness_score  = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    timeliness_score    = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    consistency_score   = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    accuracy_score      = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Composite
    composite_score     = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Méta
    computed_at = models.DateTimeField(auto_now=True)
    notes       = models.TextField(blank=True)

    class Meta:
        db_table        = "dq_score_snapshot"
        ordering        = ["-computed_at"]
        unique_together = [("logframe_row", "reporting_period")]
        verbose_name    = "DQ Score Snapshot"

    def __str__(self):
        period = self.reporting_period.label if self.reporting_period else "Global"
        return f"{self.logframe_row.indicator.code} | {period} | {self.composite_score}%"

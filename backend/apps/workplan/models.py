"""
Module 3 — Activity, Milestone & Workplan Tracking
Modèle de données canonique v6.0 · SFD M3 v1.0

Hiérarchie : WorkplanComponent → WorkplanSubComponent → Activity
Entités complémentaires : ActivityDependency · Milestone · DelayLog · SPISnapshot
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


# ---------------------------------------------------------------------------
# Vocabulaires
# ---------------------------------------------------------------------------

ACTIVITY_STATUS_CHOICES = [
    ("not_started", "Not Started"),
    ("in_progress",  "In Progress"),
    ("on_hold",      "On Hold"),
    ("completed",    "Completed"),
    ("cancelled",    "Cancelled"),
]

DEPENDENCY_TYPE_CHOICES = [
    ("FS", "Finish-to-Start"),
    ("SS", "Start-to-Start"),
    ("FF", "Finish-to-Finish"),
    ("SF", "Start-to-Finish"),
]

MILESTONE_CATEGORY_CHOICES = [
    ("contractual",   "Contractuel"),
    ("programmatic",  "Programmatique"),
    ("reporting",     "Reporting"),
]

MILESTONE_STATUS_CHOICES = [
    ("pending",    "Pending"),
    ("achieved",   "Achieved"),
    ("missed",     "Missed"),
    ("forecasted", "Forecasted"),
]

# Taxonomie standardisée des retards (SF-7 · BRQ-3.10a)
DELAY_CATEGORY_CHOICES = [
    ("procurement",        "Passation de marchés"),
    ("customs",            "Dédouanement"),
    ("weather",            "Météo / Environnement"),
    ("land",               "Foncier & Tenure"),
    ("security",           "Sécurité / Conflit"),
    ("budget",             "Contrainte budgétaire"),
    ("contractor",         "Non-performance contractant"),
    ("technical",          "Conception / Technique"),
    ("counterpart",        "Performance contrepartie"),
    ("force_majeure",      "Force majeure"),
    ("other",              "Autre"),
]

DELAY_SUBCATEGORY_CHOICES = [
    # Passation
    ("bid_preparation",    "Préparation des offres"),
    ("nol_delay",          "Retard NOL"),
    ("re_evaluation",      "Ré-évaluation"),
    ("single_bid",         "Rejet d'offre unique"),
    # Sécurité
    ("access_suspended",   "Accès suspendu"),
    ("country_suspension", "Suspension pays"),
    # Météo
    ("rainy_season",       "Saison des pluies"),
    ("flood",              "Inondation"),
    ("drought",            "Sécheresse"),
    # Foncier
    ("land_acquisition",   "Acquisition foncière"),
    ("right_of_way",       "Droit de passage"),
]

REVISION_APPROVAL_STATUS_CHOICES = [
    ("pending",  "En attente"),
    ("approved", "Approuvée"),
    ("rejected", "Rejetée"),
]


# ---------------------------------------------------------------------------
# SF-1 · Hiérarchie Composant → Sous-composant → Activité
# ---------------------------------------------------------------------------

class WorkplanComponent(models.Model):
    """
    Niveau 1 de la hiérarchie workplan, aligné sur les composantes du PAD.
    Hérité du Module 1 via project FK.
    """
    project = models.ForeignKey(
        "project.Project",
        on_delete=models.CASCADE,
        related_name="workplan_components",
    )
    code        = models.CharField(max_length=20)
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order       = models.PositiveIntegerField(default=0)
    is_active   = models.BooleanField(
        default=True,
        help_text="POL-1.07 : soft-delete.",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workplan_component"
        ordering = ["project", "order", "code"]
        unique_together = [("project", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class WorkplanSubComponent(models.Model):
    """
    Niveau 2 de la hiérarchie workplan.
    """
    component   = models.ForeignKey(
        WorkplanComponent,
        on_delete=models.CASCADE,
        related_name="sub_components",
    )
    code        = models.CharField(max_length=20)
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order       = models.PositiveIntegerField(default=0)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workplan_sub_component"
        ordering = ["component", "order", "code"]
        unique_together = [("component", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"

    @property
    def project(self):
        return self.component.project


class Activity(models.Model):
    """
    Fiche Activité — entité centrale du Module 3.

    BRQ-3.02 : tous les champs de la fiche activité.
    SF-2     : liaison vers un nœud Output du Module 2 (RG-2.1).
    SF-4     : statut + % avancement avec cycle de vie imposé.
    SF-7     : dates révisées + piste d'audit via DelayLog.
    SF-9     : budget planifié + dépensé (dépensé alimenté par M9).
    """
    sub_component = models.ForeignKey(
        WorkplanSubComponent,
        on_delete=models.CASCADE,
        related_name="activities",
    )

    # ── Identité (BRQ-3.02) ───────────────────────────────────────────────
    code        = models.CharField(max_length=30)
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # ── Responsabilité ────────────────────────────────────────────────────
    responsible_user = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="activities_responsible",
        help_text="Utilisateur LLFMU responsable (si interne à la plateforme).",
    )
    responsible_party = models.CharField(
        max_length=255, blank=True,
        help_text="Nom libre pour un responsable externe (contractant, partenaire, ministère).",
    )

    # ── Dates ─────────────────────────────────────────────────────────────
    planned_start  = models.DateField(help_text="Date de début planifiée (baseline).")
    planned_end    = models.DateField(help_text="Date de fin planifiée (baseline).")
    # Baseline figée au premier enregistrement (RG-1.1)
    baseline_start = models.DateField(null=True, blank=True, editable=False)
    baseline_end   = models.DateField(null=True, blank=True, editable=False)
    # Date de fin révisée (SF-7)
    revised_end    = models.DateField(
        null=True, blank=True,
        help_text="Date de fin révisée — motif obligatoire dans DelayLog.",
    )
    actual_end     = models.DateField(null=True, blank=True)

    # ── Statut & avancement (SF-4) ────────────────────────────────────────
    status   = models.CharField(
        max_length=20, choices=ACTIVITY_STATUS_CHOICES, default="not_started",
    )
    progress = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Pourcentage d'avancement (0–100).",
    )

    # ── Drapeaux (BRQ-3.02) ───────────────────────────────────────────────
    requires_evidence  = models.BooleanField(
        default=False,
        help_text="Preuve obligatoire avant passage à Completed (RG-4.4).",
    )
    is_kpi_linked      = models.BooleanField(
        default=False,
        help_text="Activité liée à un KPI de suivi spécifique.",
    )
    is_critical_path   = models.BooleanField(
        default=False,
        help_text="Activité sur le chemin critique du projet.",
    )

    # ── Liaison Activité-Résultats SF-2 (RG-2.1) ─────────────────────────
    # Liaison vers nœud Output du Module 2.
    # Seuls les nœuds chain_level='output' sont valides (contrôle en serializer/service).
    output_node = models.ForeignKey(
        "results.ToCNode",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="linked_activities",
        help_text="Nœud Output du Module 2 auquel cette activité contribue (RG-2.1).",
    )

    # ── Budget SF-9 ───────────────────────────────────────────────────────
    budget_planned = models.DecimalField(
        max_digits=15, decimal_places=2, default=0,
        help_text="Budget planifié en USD.",
    )
    budget_spent   = models.DecimalField(
        max_digits=15, decimal_places=2, default=0,
        help_text="Dépensé réel lu depuis le Module 9 (alimenté automatiquement).",
    )

    # ── Ordre & audit ─────────────────────────────────────────────────────
    order      = models.PositiveIntegerField(default=0)
    is_active  = models.BooleanField(default=True, help_text="POL-1.07 : soft-delete.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="activities_created",
    )

    class Meta:
        db_table = "activity"
        ordering = ["sub_component", "order", "code"]
        unique_together = [("sub_component", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"

    @property
    def project(self):
        return self.sub_component.component.project

    def save(self, *args, **kwargs):
        # Figer les dates baseline au premier enregistrement (RG-1.1)
        if not self.pk:
            self.baseline_start = self.planned_start
            self.baseline_end   = self.planned_end
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        """RG-7.1 : overdue si date courante > fin effective et % < 100."""
        effective_end = self.revised_end or self.planned_end
        return (
            self.status not in ("completed", "cancelled")
            and self.progress < 100
            and timezone.now().date() > effective_end
        )

    @property
    def schedule_variance_days(self):
        """Écart en jours entre fin planifiée (baseline) et fin révisée/réelle."""
        end = self.revised_end or self.actual_end
        if end and self.baseline_end:
            return (end - self.baseline_end).days
        return 0

    @property
    def burn_rate(self):
        """SF-9 : ratio budget dépensé / budget planifié."""
        if self.budget_planned and self.budget_planned > 0:
            return float(self.budget_spent) / float(self.budget_planned)
        return 0.0


# ---------------------------------------------------------------------------
# SF-1 · Dépendances entre activités (RG-1.1 · BRQ-3.03)
# ---------------------------------------------------------------------------

class ActivityDependency(models.Model):
    """
    Dépendance logique entre deux activités.
    Types : FS (Finish-to-Start), SS, FF, SF.
    Dépendances circulaires interdites (validées en service).
    """
    predecessor = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name="successor_deps",
    )
    successor   = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name="predecessor_deps",
    )
    dep_type    = models.CharField(
        max_length=2, choices=DEPENDENCY_TYPE_CHOICES, default="FS",
    )
    lag_days    = models.IntegerField(
        default=0,
        help_text="Décalage en jours (positif = délai, négatif = chevauchement).",
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "activity_dependency"
        unique_together = [("predecessor", "successor")]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(predecessor=models.F("successor")),
                name="no_self_dependency",
            )
        ]

    def __str__(self):
        return f"{self.predecessor.code} →[{self.dep_type}+{self.lag_days}j]→ {self.successor.code}"


# ---------------------------------------------------------------------------
# SF-5 · Jalons (BRQ-3.08 / 3.08a)
# ---------------------------------------------------------------------------

class Milestone(models.Model):
    """
    Jalon lié à une activité.
    Catégories : contractuel · programmatique · reporting.
    """
    activity    = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name="milestones",
    )
    name        = models.CharField(max_length=255)
    category    = models.CharField(max_length=20, choices=MILESTONE_CATEGORY_CHOICES)
    planned_date = models.DateField()
    actual_date  = models.DateField(null=True, blank=True)
    status       = models.CharField(
        max_length=15, choices=MILESTONE_STATUS_CHOICES, default="pending",
    )
    # Preuve obligatoire (RG-5.2)
    evidence_url  = models.URLField(blank=True)
    evidence_note = models.TextField(blank=True)
    # Gate logic : si is_gate=True, l'activité ne peut atteindre 100% sans ce jalon achieved (RG-5.2)
    is_gate      = models.BooleanField(
        default=False,
        help_text="Jalon-gate : bloque le passage à 100% de l'activité si non atteint.",
    )
    # Passation : jalons procure synchronisés depuis M8 (RG-5.1)
    is_procurement = models.BooleanField(
        default=False,
        help_text="Jalon de passation synchronisé depuis le Module 8.",
    )
    ai_forecast_date = models.DateField(
        null=True, blank=True,
        help_text="Date d'atteinte prévue par l'IA (BRQ-3.26).",
    )
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "milestone"
        ordering = ["activity", "planned_date", "order"]

    def __str__(self):
        return f"{self.activity.code} · {self.name} ({self.planned_date})"


# ---------------------------------------------------------------------------
# SF-7 · Journal des retards (BRQ-3.10 / 3.10a)
# ---------------------------------------------------------------------------

class DelayLog(models.Model):
    """
    Enregistrement d'un retard ou d'une révision de date.
    Taxonomie standardisée (RG-7.2) — remplace le texte libre.
    Piste d'audit permanente : les dates baseline ne sont jamais modifiées.
    """
    activity         = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name="delay_logs",
    )
    # Dates avant/après révision
    previous_end     = models.DateField(help_text="Date de fin avant révision.")
    revised_end      = models.DateField(help_text="Nouvelle date de fin proposée.")
    variance_days    = models.IntegerField(
        help_text="Écart en jours (révisée - précédente). Positif = retard.",
    )
    # Taxonomie (RG-7.2 · BRQ-3.10a)
    delay_category   = models.CharField(max_length=30, choices=DELAY_CATEGORY_CHOICES)
    delay_subcategory = models.CharField(
        max_length=30, choices=DELAY_SUBCATEGORY_CHOICES, blank=True,
    )
    justification    = models.TextField(help_text="Narrative justificative obligatoire.")
    # Cascade sur successeurs (RG-7.3)
    cascade_applied  = models.BooleanField(
        default=False,
        help_text="La cascade sur les activités successeurs a été appliquée.",
    )
    # Approbation (RG-7.4)
    cumulative_variance_days = models.IntegerField(
        default=0,
        help_text="Variance cumulée depuis le baseline (pour seuil d'approbation).",
    )
    approval_status  = models.CharField(
        max_length=10,
        choices=REVISION_APPROVAL_STATUS_CHOICES,
        default="pending",
    )
    approved_by      = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="delay_approvals",
    )
    approved_at      = models.DateTimeField(null=True, blank=True)
    recorded_by      = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="delay_logs_recorded",
    )
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "delay_log"
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.activity.code} · +{self.variance_days}j "
            f"({self.get_delay_category_display()})"
        )


# ---------------------------------------------------------------------------
# SF-8 · SPI Snapshot (BRQ-3.14)
# ---------------------------------------------------------------------------

ALERT_TYPE_CHOICES = [
    ("milestone_t30",   "Milestone due in 30 days"),
    ("milestone_t7",    "Milestone due in 7 days"),
    ("milestone_t0",    "Milestone due today"),
    ("milestone_missed","Milestone missed"),
    ("activity_overdue","Activity overdue"),
    ("delay_pending",   "Delay revision pending approval"),
    ("escalation_l1",   "Escalation L1 — PMU PM (>15d overdue)"),
    ("escalation_l2",   "Escalation L2 — Regional Hub (>30d overdue)"),
    ("escalation_l3",   "Escalation L3 — LLFMU (>60d overdue)"),
]

ALERT_STATUS_CHOICES = [
    ("active",      "Active"),
    ("acknowledged","Acknowledged"),
    ("resolved",    "Resolved"),
]


class WorkplanAlert(models.Model):
    """
    Alerte générée automatiquement par le moteur SF-6.
    Créée par la tâche Celery check_workplan_alerts (quotidienne).
    BRQ-3.16 / RG-6.1 / RG-6.2 / RG-6.3
    """
    project    = models.ForeignKey(
        "project.Project",
        on_delete=models.CASCADE,
        related_name="workplan_alerts",
    )
    activity   = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="alerts",
    )
    milestone  = models.ForeignKey(
        Milestone,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="alerts",
    )
    alert_type = models.CharField(max_length=30, choices=ALERT_TYPE_CHOICES)
    status     = models.CharField(
        max_length=15, choices=ALERT_STATUS_CHOICES, default="active",
    )
    # Contexte de l'alerte (RG-6.3)
    message        = models.TextField(help_text="Message descriptif de l'alerte.")
    days_overdue   = models.IntegerField(
        default=0,
        help_text="Nombre de jours de retard au moment de la génération.",
    )
    # Qui doit agir
    assigned_to    = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="workplan_alerts_assigned",
    )
    # Email envoyé ?
    email_sent     = models.BooleanField(default=False)
    email_sent_at  = models.DateTimeField(null=True, blank=True)
    # Acknowledgement
    acknowledged_by = models.ForeignKey(
        "identity.AppUser",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="workplan_alerts_acked",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    # Déduplication — évite de recréer la même alerte chaque jour
    dedup_key      = models.CharField(
        max_length=100, unique=True,
        help_text="Clé de déduplication : type:activity_id:date ou type:milestone_id:date.",
    )
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workplan_alert"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["alert_type", "status"]),
        ]

    def __str__(self):
        return f"{self.get_alert_type_display()} — {self.project.code} ({self.status})"

    """
    Instantané du Schedule Performance Index calculé périodiquement.
    Niveaux : activity · project · portfolio.
    EV = % avancement pondéré budget ; PV = temps écoulé × budget planifié.
    """
    LEVEL_CHOICES = [
        ("activity",  "Activité"),
        ("project",   "Projet"),
        ("portfolio", "Portefeuille"),
    ]

    level       = models.CharField(max_length=10, choices=LEVEL_CHOICES)
    # Référence optionnelle selon le niveau
    activity    = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="spi_snapshots",
    )
    project     = models.ForeignKey(
        "project.Project",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="spi_snapshots",
    )
    # Valeurs SPI
    earned_value   = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    planned_value  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    spi            = models.DecimalField(
        max_digits=6, decimal_places=4, default=0,
        help_text="SPI = EV / PV. > 1 : en avance ; ≈ 1 : sur trajectoire ; < 1 : en retard.",
    )
    snapshot_date  = models.DateField(default=timezone.now)
    computed_at    = models.DateTimeField(auto_now_add=True)
    # Méthode documentée (RG-8.2)
    method_note    = models.TextField(
        blank=True,
        help_text="Description de la méthode de calcul (auditabilité RG-8.2).",
    )

    class Meta:
        db_table = "spi_snapshot"
        ordering = ["-snapshot_date", "level"]

    def __str__(self):
        return f"SPI {self.level} · {self.snapshot_date} · {self.spi}"

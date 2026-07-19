"""
Domaine results — Theorie du Changement (SF-1 Etape 2, BRQ-1.35) +
Catalogue d'indicateurs et Logframe (Module 2).

Architecture :
  Indicator      — bibliotheque institutionnelle LLF2 (LLFMU uniquement)
  LogframeRow    — une ligne du cadre logique par projet
  LogframeTarget — cibles a date libre par ligne logframe
  ToCNode        — key_result_indicator remplace par FK nullable vers LogframeRow
"""
from django.db import models

from apps.identity.models import AppUser
from apps.project.models import Project
from apps.reference.models import Sdg, Sector

TOC_STATUS_CHOICES = [
    ("draft", "Brouillon"),
    ("active", "Active"),
]

CHAIN_LEVEL_CHOICES = [
    ("activity", "Activite"),
    ("output", "Produit"),
    ("immediate_outcome", "Effet immediat"),
    ("intermediate_outcome", "Effet intermediaire"),
]

CHAIN_LEVEL_WITH_IMPACT_CHOICES = CHAIN_LEVEL_CHOICES + [("impact", "Impact")]

PARENT_LEVEL = {
    "activity": None,
    "output": "activity",
    "immediate_outcome": "output",
    "intermediate_outcome": "immediate_outcome",
}

INDICATOR_TYPE_CHOICES = [
    ("output", "Output"),
    ("outcome", "Outcome"),
    ("impact", "Impact"),
]

DIRECTION_CHOICES = [
    ("increase", "A la hausse (+)"),
    ("decrease", "A la baisse (-)"),
    ("neutral", "Neutre"),
]

MEASUREMENT_FREQUENCY_CHOICES = [
    ("quarterly", "Trimestrielle"),
    ("semi_annual", "Semestrielle"),
    ("annual", "Annuelle"),
    ("end_of_project", "Fin de projet"),
]


class Indicator(models.Model):
    """
    Catalogue institutionnel LLF2. Alimente par LLFMU uniquement via
    l'admin Django. Tous les champs de la fiche IRS (Indicator Reference
    Sheet) sont stockes pour eviter une migration a chaque nouveau handbook.
    """

    code = models.CharField(max_length=20, unique=True)
    sector = models.ForeignKey(
        Sector, on_delete=models.PROTECT, related_name="indicators"
    )
    subsector = models.CharField(max_length=150, blank=True)
    name = models.TextField()
    indicator_type = models.CharField(max_length=10, choices=INDICATOR_TYPE_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    definition = models.TextField()
    unit = models.CharField(max_length=100)
    numerator = models.TextField(blank=True)
    denominator = models.TextField(blank=True)
    calculation_method = models.TextField(blank=True)
    formula = models.TextField(blank=True)
    disaggregation = models.TextField(blank=True)
    data_source = models.TextField(blank=True)
    collection_method = models.TextField(blank=True)
    reporting_frequency = models.CharField(
        max_length=15, choices=MEASUREMENT_FREQUENCY_CHOICES, blank=True
    )
    means_of_verification = models.TextField(blank=True)
    responsible = models.CharField(max_length=200, blank=True)
    assumptions = models.TextField(blank=True)
    limitations = models.TextField(blank=True)
    related_sdgs = models.ManyToManyField(Sdg, blank=True, related_name="indicators")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "indicator"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name[:60]}"


class TheoryOfChange(models.Model):
    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="theory_of_change"
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=10, choices=TOC_STATUS_CHOICES, default="draft")
    problem_statement = models.TextField(blank=True)
    ultimate_outcome = models.TextField(blank=True)
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


class LogframeRow(models.Model):
    """
    Ligne du cadre logique — source de verite pour indicateur + projet + noeud.
    toc_node nullable : l'Impact (sommet de la chaine) vit sur TheoryOfChange,
    pas sur un ToCNode.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="logframe_rows"
    )
    # toc_node renseigne APRES la creation du noeud (ou pas du tout pour Impact)
    indicator = models.ForeignKey(
        Indicator, on_delete=models.PROTECT, related_name="logframe_rows"
    )
    chain_level = models.CharField(
        max_length=25, choices=CHAIN_LEVEL_WITH_IMPACT_CHOICES
    )
    baseline_value = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    baseline_year = models.PositiveIntegerField(null=True, blank=True)
    baseline_source = models.TextField(blank=True)
    measurement_frequency = models.CharField(
        max_length=15, choices=MEASUREMENT_FREQUENCY_CHOICES, blank=True
    )
    notes = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "logframe_row"
        ordering = ["chain_level", "order", "id"]
        unique_together = [("project", "indicator")]

    def __str__(self):
        return f"{self.project.code} | {self.indicator.code}"


class LogframeTarget(models.Model):
    """Cible a date libre par ligne logframe."""

    logframe_row = models.ForeignKey(
        LogframeRow, on_delete=models.CASCADE, related_name="targets"
    )
    target_value = models.DecimalField(max_digits=18, decimal_places=4)
    target_date = models.DateField()
    label = models.CharField(max_length=50, blank=True)
    disaggregation_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "logframe_target"
        ordering = ["target_date"]

    def __str__(self):
        return f"{self.logframe_row} → {self.target_value} ({self.target_date})"


class ToCNode(models.Model):
    """
    Noeud de la chaine causale. logframe_row remplace key_result_indicator
    (texte libre provisoire) — FK nullable vers LogframeRow.
    """

    toc = models.ForeignKey(TheoryOfChange, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    code = models.CharField(max_length=20, blank=True, editable=False)
    chain_level = models.CharField(max_length=25, choices=CHAIN_LEVEL_CHOICES)
    statement = models.TextField()
    logframe_row = models.ForeignKey(
        LogframeRow, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="toc_nodes"
    )
    means_of_verification = models.TextField(blank=True)
    assumptions = models.TextField(blank=True)
    risks_mitigation = models.TextField(blank=True)
    adaptation_strategy = models.TextField(blank=True)
    gender_climate_tag = models.CharField(max_length=100, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "toc_node"
        ordering = ["chain_level", "order", "id"]

    def __str__(self):
        return f"{self.code} - {self.statement[:40]}"

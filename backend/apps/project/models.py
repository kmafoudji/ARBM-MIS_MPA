"""
Domaine project — squelette de la table project (Module 1, assistant de
creation de projet). Les domaines results/indicator (Module 2) viendront
s'y accrocher ensuite.
"""
from django.db import models

from apps.identity.models import AppUser
from apps.reference.models import Country, Currency, Donor, RegionalHub, Sdg, Sector


class Project(models.Model):
    STATUS_CHOICES = [
        ("draft", "Brouillon"),
        ("active", "Actif"),
        ("closed", "Cloture"),
    ]

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=255)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="projects")
    hub = models.ForeignKey(
        RegionalHub, on_delete=models.SET_NULL, null=True, blank=True, related_name="projects"
    )
    sector = models.ForeignKey(Sector, on_delete=models.PROTECT, related_name="projects")
    donors = models.ManyToManyField(Donor, related_name="projects", blank=True)
    sdgs = models.ManyToManyField(Sdg, through="ProjectSdg", related_name="projects", blank=True)

    budget_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, null=True, blank=True)

    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft")

    created_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="projects_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project"

    def __str__(self):
        return f"{self.code} - {self.name}"


class ProjectSdg(models.Model):
    """Table de jonction N..N project <-> sdg."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    sdg = models.ForeignKey(Sdg, on_delete=models.CASCADE)

    class Meta:
        db_table = "project_sdg"
        unique_together = ("project", "sdg")

"""
Domaine reference — donnees referentielles partagees par tous les modules.
Aligne sur le modele de donnees canonique v6.0.
"""
from django.contrib.gis.db import models as gis_models
from django.db import models


class Currency(models.Model):
    code = models.CharField(max_length=3, primary_key=True, help_text="Code ISO 4217, ex. USD")
    name = models.CharField(max_length=100)

    class Meta:
        db_table = "currency"
        verbose_name_plural = "currencies"

    def __str__(self):
        return self.code


class RegionalHub(models.Model):
    code = models.SlugField(max_length=20, unique=True)
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "regional_hub"

    def __str__(self):
        return self.name


class Country(models.Model):
    iso2 = models.CharField(max_length=2, unique=True)
    iso3 = models.CharField(max_length=3, unique=True)
    name = models.CharField(max_length=150)
    hub = models.ForeignKey(
        RegionalHub, on_delete=models.SET_NULL, null=True, blank=True, related_name="countries"
    )
    is_fragile = models.BooleanField(default=False, help_text="Contexte de fragilite (FCS).")
    geometry = gis_models.MultiPolygonField(null=True, blank=True, srid=4326)

    class Meta:
        db_table = "country"
        verbose_name_plural = "countries"

    def __str__(self):
        return self.name


class GadmArea(models.Model):
    """Decoupage infranational (GADM Admin 1/2) d'un pays."""

    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name="gadm_areas")
    level = models.PositiveSmallIntegerField(help_text="1 = region/etat, 2 = district/departement")
    name = models.CharField(max_length=150)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    geometry = gis_models.MultiPolygonField(null=True, blank=True, srid=4326)

    class Meta:
        db_table = "gadm_area"

    def __str__(self):
        return f"{self.name} (niv.{self.level})"


class Donor(models.Model):
    """Les 6 donateurs du LLF2 : ADFD, Gates Foundation, IsDB, ISFD, KSRelief, QFFD."""

    code = models.SlugField(max_length=20, unique=True)
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "donor"

    def __str__(self):
        return self.name


class Sector(models.Model):
    """Secteurs LLF2 (Sante, Agriculture, Infrastructure), hierarchique."""

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=150)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )

    class Meta:
        db_table = "sector"

    def __str__(self):
        return self.name


class Sdg(models.Model):
    """Objectifs de developpement durable (17 ODD)."""

    number = models.PositiveSmallIntegerField(primary_key=True)
    name = models.CharField(max_length=200)

    class Meta:
        db_table = "sdg"
        verbose_name = "SDG"
        verbose_name_plural = "SDGs"

    def __str__(self):
        return f"SDG {self.number} - {self.name}"


class SdgTarget(models.Model):
    sdg = models.ForeignKey(Sdg, on_delete=models.CASCADE, related_name="targets")
    code = models.CharField(max_length=10, help_text="Ex. 3.1, 3.2")
    description = models.TextField()

    class Meta:
        db_table = "sdg_target"

    def __str__(self):
        return self.code


class Marker(models.Model):
    """Marqueurs OECD-DAC (genre, climat, etc.)."""

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "marker"

    def __str__(self):
        return self.name


class CrossCuttingTheme(models.Model):
    """Themes transversaux SF-2 (Climat, Fragilite, Emploi jeunes, Handicap, Migration...)."""

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=150)

    class Meta:
        db_table = "cross_cutting_theme"

    def __str__(self):
        return self.name

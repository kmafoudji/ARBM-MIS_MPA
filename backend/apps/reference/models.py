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
    city = models.CharField(max_length=100, blank=True, help_text="Ville d'implantation du hub.")
    color = models.CharField(
        max_length=7, blank=True, help_text="Couleur d'identification (#RRGGBB) pour les vues."
    )
    is_active = models.BooleanField(
        default=True,
        help_text="POL-1.07 : pas de suppression definitive. Un element desactive "
        "reste attache aux donnees qui le referencent deja, mais n'est plus "
        "proposable pour de nouvelles saisies.",
    )

    class Meta:
        db_table = "regional_hub"
        ordering = ["name"]

    def __str__(self):
        return self.name


def iso2_to_flag(iso2):
    """
    Convertit un code ISO 3166-1 alpha-2 en emoji drapeau, en mappant chaque
    lettre vers son symbole indicateur regional Unicode (A -> U+1F1E6).
    Derive plutot que stocke : toujours coherent avec l'ISO2, zero maintenance.
    """
    if not iso2 or len(iso2) != 2 or not iso2.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso2.upper())


class Country(models.Model):
    iso2 = models.CharField(max_length=2, unique=True)
    iso3 = models.CharField(max_length=3, unique=True)
    name = models.CharField(max_length=150)
    hub = models.ForeignKey(
        RegionalHub, on_delete=models.SET_NULL, null=True, blank=True, related_name="countries"
    )
    is_fragile = models.BooleanField(default=False, help_text="Contexte de fragilite (FCS).")
    geometry = gis_models.MultiPolygonField(null=True, blank=True, srid=4326)
    is_active = models.BooleanField(
        default=True,
        help_text="POL-1.07 : pas de suppression definitive. Un element desactive "
        "reste attache aux donnees qui le referencent deja, mais n'est plus "
        "proposable pour de nouvelles saisies.",
    )

    class Meta:
        db_table = "country"
        verbose_name_plural = "countries"
        ordering = ["name"]

    @property
    def flag(self):
        return iso2_to_flag(self.iso2)

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

    DONOR_TYPE_CHOICES = [
        ("bilateral", "Bilateral"),
        ("multilateral", "Multilateral"),
        ("foundation", "Fondation"),
        ("humanitarian", "Humanitaire"),
    ]

    code = models.SlugField(max_length=20, unique=True)
    short_name = models.CharField(max_length=20, blank=True, help_text="Sigle, ex. KSRelief.")
    name = models.CharField(max_length=150)
    donor_type = models.CharField(
        max_length=15, choices=DONOR_TYPE_CHOICES, null=True, blank=True
    )
    origin_iso2 = models.CharField(
        max_length=2,
        blank=True,
        help_text="Code ISO2 du pays d'origine (ex. AE, SA, QA, US). Champ libre et "
        "non FK : les pays d'origine des bailleurs ne sont pas des pays du "
        "portefeuille et n'ont rien a faire dans le referentiel country. "
        "Laisser vide pour les institutions multilaterales (IsDB, ISFD), qui "
        "n'ont pas de drapeau national.",
    )
    color = models.CharField(
        max_length=7, blank=True, help_text="Couleur institutionnelle (#RRGGBB), "
        "utilisee en repli quand aucun logo n'est fourni."
    )
    logo_url = models.CharField(
        max_length=300,
        blank=True,
        help_text="Chemin ou URL du logo officiel. Accepte un asset servi par "
        "l'application (/logos/donors/isdb.png) ou une URL absolue (Blob "
        "Storage). Conformement au principe du projet, aucune image n'est "
        "stockee en base64. A defaut, un monogramme colore est affiche.",
    )
    committed_amount_usd = models.DecimalField(
        max_digits=16, decimal_places=2, null=True, blank=True,
        help_text="Engagement au LLF2, en USD. A renseigner depuis les chiffres "
        "officiels de la LLF MU : les engagements publies varient selon la phase "
        "et melent subventions, prets concessionnels et waqf.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="POL-1.07 : pas de suppression definitive. Un element desactive "
        "reste attache aux donnees qui le referencent deja, mais n'est plus "
        "proposable pour de nouvelles saisies.",
    )

    class Meta:
        db_table = "donor"
        ordering = ["name"]

    @property
    def flag(self):
        return iso2_to_flag(self.origin_iso2)

    def __str__(self):
        return self.name


class ImplementingAgency(models.Model):
    """
    Agences d'execution / de mise en oeuvre des projets (ministeres,
    agences nationales, agences ONU, ONG).
    """

    AGENCY_TYPE_CHOICES = [
        ("government", "Gouvernement"),
        ("national_agency", "Agence nationale"),
        ("un_agency", "Agence ONU"),
        ("ngo", "ONG"),
        ("private", "Secteur prive"),
    ]

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=200)
    agency_type = models.CharField(max_length=20, choices=AGENCY_TYPE_CHOICES)
    country = models.ForeignKey(
        Country,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="implementing_agencies",
        help_text="Vide pour les agences internationales (ONU, ONG multi-pays).",
    )
    logo_url = models.CharField(
        max_length=300,
        blank=True,
        help_text="Chemin ou URL du logo officiel. A defaut, un monogramme est affiche.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="POL-1.07 : pas de suppression definitive. Un element desactive "
        "reste attache aux donnees qui le referencent deja, mais n'est plus "
        "proposable pour de nouvelles saisies.",
    )

    class Meta:
        db_table = "implementing_agency"
        ordering = ["name"]
        verbose_name_plural = "implementing agencies"

    @property
    def flag(self):
        return self.country.flag if self.country else ""

    def __str__(self):
        return self.name


class Sector(models.Model):
    """Secteurs LLF2 (Sante, Agriculture, Infrastructure), hierarchique."""

    ICON_CHOICES = [
        ("health", "Sante (croix medicale)"),
        ("agriculture", "Agriculture (epi)"),
        ("infrastructure", "Infrastructure (batiment)"),
        ("gender", "Genre (symbole Venus)"),
        ("climate", "Climat (feuille)"),
        ("water", "Eau (goutte)"),
        ("education", "Education (livre)"),
        ("generic", "Generique (losange)"),
    ]

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=150)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    icon = models.CharField(
        max_length=20, choices=ICON_CHOICES, default="generic",
        help_text="Pictogramme illustratif. Rendu en SVG cote frontend plutot "
        "qu'en emoji : les emojis ne s'affichent pas de maniere fiable selon "
        "le systeme d'exploitation.",
    )
    color = models.CharField(
        max_length=7, blank=True, help_text="Couleur identitaire du secteur (#RRGGBB)."
    )

    is_active = models.BooleanField(
        default=True,
        help_text="POL-1.07 : pas de suppression definitive. Un element desactive "
        "reste attache aux donnees qui le referencent deja, mais n'est plus "
        "proposable pour de nouvelles saisies.",
    )

    class Meta:
        db_table = "sector"

    def __str__(self):
        return self.name


class Sdg(models.Model):
    """Objectifs de developpement durable (17 ODD)."""

    number = models.PositiveSmallIntegerField(primary_key=True)
    name = models.CharField(max_length=200)
    color = models.CharField(
        max_length=7, blank=True,
        help_text="Couleur officielle ONU de l'ODD (#RRGGBB). Le systeme affiche "
        "une tuile numerotee a cette couleur : les pictogrammes officiels des ODD "
        "sont des marques de l'ONU soumises a des regles d'usage, ils ne sont donc "
        "pas reproduits ici.",
    )

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

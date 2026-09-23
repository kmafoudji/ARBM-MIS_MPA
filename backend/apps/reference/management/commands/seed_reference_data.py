"""
Peuple les donnees de reference du portefeuille LLF2 : devises, hubs
regionaux, pays, donateurs, agences d'implementation, secteurs, ODD,
marqueurs OECD-DAC, themes transversaux.

Sources : les hubs et les pays viennent du referentiel de portefeuille
(seed_hub_country), soit 10 hubs et 57 pays ; le reste vient de la demo
statique Sentinelle (sentinelle-admin.html), croisee avec les
specifications fonctionnelles anterieures.

Ces memes 10 hubs et 57 pays sont aussi publies en fixture serialisee dans
fixtures/seed_hubs_countries.json. Les deux chemins doivent produire le
meme etat : toute modification de HUBS ou COUNTRIES doit etre repercutee
sur la fixture, et inversement.

LIMITES CONNUES (a lever avec les donnees officielles LLF2) :
  - Le libelle de region du referentiel (West Africa, North East Africa...)
    n'est pas repris : RegionalHub n'a pas de champ ou le stocker.
  - Les drapeaux ne sont pas stockes : ils sont derives du code ISO2
    (voir reference.models.iso2_to_flag).

Idempotent : peut etre relancee sans creer de doublons (get_or_create).

Usage :
    python manage.py seed_reference_data
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.reference.models import (
    Country,
    CrossCuttingTheme,
    Currency,
    Donor,
    ImplementingAgency,
    Marker,
    RegionalHub,
    Sdg,
    Sector,
)


CURRENCIES = [
    ("USD", "US Dollar"),
    ("EUR", "Euro"),
]

# (code, nom, ville, couleur)
HUBS = [
    ("HUB_SN", "Dakar Hub", "Dakar", "#A4C53F"),
    ("HUB_NG", "Abuja Hub", "Abuja", "#3F6CC5"),
    ("HUB_MA", "Rabat Hub", "Rabat", "#C97FB0"),
    ("HUB_EG", "Cairo Hub", "Cairo", "#D98F3C"),
    ("HUB_UG", "Kampala Hub", "Kampala", "#5BB39F"),
    ("HUB_TR", "Ankara Hub", "Ankara", "#C25B4E"),
    ("HUB_KZ", "Almaty Hub", "Almaty", "#8393B5"),
    ("HUB_BD", "Dhaka Hub", "Dhaka", "#7B68C7"),
    ("HUB_ID", "Jakarta Hub", "Jakarta", "#6BA84F"),
    ("HUB_SA", "Jeddah HQ", "Jeddah", "#B08D57"),
]

# Codes portes par une version anterieure du seed, avant l'alignement sur le
# referentiel. get_or_create travaille sur le code : sans ce menage, une base
# deja semee garderait les anciens hubs en doublon des nouveaux, la contrainte
# d'unicite portant sur le nom et non sur le code. Desactives, jamais
# supprimes (POL-1.07).
LEGACY_HUB_CODES = ["dakar", "abuja", "kampala", "rabat", "dhaka"]

# (iso2, iso3, nom, code_hub)
COUNTRIES = [
    # Hub Dakar (HUB_SN)
    ("SN", "SEN", "Senegal", "HUB_SN"),
    ("GM", "GMB", "The Gambia", "HUB_SN"),
    ("GW", "GNB", "Guinea-Bissau", "HUB_SN"),
    ("GN", "GIN", "Guinea", "HUB_SN"),
    ("ML", "MLI", "Mali", "HUB_SN"),
    ("CI", "CIV", "Côte d'Ivoire", "HUB_SN"),
    ("TG", "TGO", "Togo", "HUB_SN"),
    ("BJ", "BEN", "Benin", "HUB_SN"),
    ("BF", "BFA", "Burkina Faso", "HUB_SN"),
    # Hub Abuja (HUB_NG)
    ("NG", "NGA", "Nigeria", "HUB_NG"),
    ("NE", "NER", "Niger", "HUB_NG"),
    ("TD", "TCD", "Chad", "HUB_NG"),
    ("CM", "CMR", "Cameroon", "HUB_NG"),
    ("GA", "GAB", "Gabon", "HUB_NG"),
    ("SL", "SLE", "Sierra Leone", "HUB_NG"),
    # Hub Rabat (HUB_MA)
    ("MA", "MAR", "Morocco", "HUB_MA"),
    ("MR", "MRT", "Mauritania", "HUB_MA"),
    ("DZ", "DZA", "Algeria", "HUB_MA"),
    ("TN", "TUN", "Tunisia", "HUB_MA"),
    ("LY", "LBY", "Libya", "HUB_MA"),
    ("SR", "SUR", "Suriname", "HUB_MA"),
    ("GY", "GUY", "Guyana", "HUB_MA"),
    # Hub Cairo (HUB_EG)
    ("EG", "EGY", "Egypt", "HUB_EG"),
    ("SD", "SDN", "Sudan", "HUB_EG"),
    # Hub Kampala (HUB_UG)
    ("UG", "UGA", "Uganda", "HUB_UG"),
    ("MZ", "MOZ", "Mozambique", "HUB_UG"),
    ("DJ", "DJI", "Djibouti", "HUB_UG"),
    ("KM", "COM", "Comoros", "HUB_UG"),
    ("SO", "SOM", "Somalia", "HUB_UG"),
    # Hub Ankara (HUB_TR)
    ("TR", "TUR", "Türkiye", "HUB_TR"),
    ("IR", "IRN", "Iran", "HUB_TR"),
    ("PK", "PAK", "Pakistan", "HUB_TR"),
    ("AF", "AFG", "Afghanistan", "HUB_TR"),
    ("AL", "ALB", "Albania", "HUB_TR"),
    ("AZ", "AZE", "Azerbaijan", "HUB_TR"),
    # Hub Almaty (HUB_KZ)
    ("KZ", "KAZ", "Kazakhstan", "HUB_KZ"),
    ("TM", "TKM", "Turkmenistan", "HUB_KZ"),
    ("UZ", "UZB", "Uzbekistan", "HUB_KZ"),
    ("TJ", "TJK", "Tajikistan", "HUB_KZ"),
    ("KG", "KGZ", "Kyrgyz Republic", "HUB_KZ"),
    # Hub Dhaka (HUB_BD)
    ("BD", "BGD", "Bangladesh", "HUB_BD"),
    ("MV", "MDV", "Maldives", "HUB_BD"),
    # Hub Jakarta (HUB_ID)
    ("ID", "IDN", "Indonesia", "HUB_ID"),
    ("MY", "MYS", "Malaysia", "HUB_ID"),
    ("BN", "BRN", "Brunei Darussalam", "HUB_ID"),
    # Hub Jeddah (HUB_SA)
    ("SA", "SAU", "Saudi Arabia", "HUB_SA"),
    ("BH", "BHR", "Bahrain", "HUB_SA"),
    ("KW", "KWT", "Kuwait", "HUB_SA"),
    ("QA", "QAT", "Qatar", "HUB_SA"),
    ("AE", "ARE", "United Arab Emirates", "HUB_SA"),
    ("OM", "OMN", "Oman", "HUB_SA"),
    ("YE", "YEM", "Yemen", "HUB_SA"),
    ("LB", "LBN", "Lebanon", "HUB_SA"),
    ("PS", "PSE", "Palestine", "HUB_SA"),
    ("JO", "JOR", "Jordan", "HUB_SA"),
    ("IQ", "IRQ", "Iraq", "HUB_SA"),
    ("SY", "SYR", "Syria", "HUB_SA"),
]

# (code, sigle, nom, type, iso2 d'origine, couleur, chemin du logo)
# origin_iso2 vide = institution multilaterale, pas de drapeau national.
#
# MONTANTS VOLONTAIREMENT ABSENTS. Une version anterieure de ce seed portait
# des montants (ADFD 500M, Gates 200M, IsDB 1.0B...) repris de la demo
# statique, ou ils n'etaient qu'illustratifs. Ils sont faux :
#   - ils confondaient les 2 Md USD de FINANCEMENT IsDB (prets) avec une
#     subvention de bailleur, alors que la structure du fonds est
#     2 Md de prets IsDB + 500 M de subventions des bailleurs ;
#   - les engagements publies sont par phase (LLF1 / LLF2) et melent
#     subventions, prets concessionnels et waqf.
# Les engagements doivent etre saisis depuis les chiffres officiels de la
# LLF MU via l'ecran Donnees de base.
DONORS = [
    ("adfd", "ADFD", "Abu Dhabi Fund for Development", "bilateral", "AE", "#C8102E", "/logos/donors/adfd.png"),
    ("gates", "GF", "Bill & Melinda Gates Foundation", "foundation", "US", "#222A35", "/logos/donors/gates.png"),
    ("isdb", "IsDB", "Islamic Development Bank", "multilateral", "", "#0B5C3A", "/logos/donors/isdb.png"),
    ("isfd", "ISFD", "Islamic Solidarity Fund for Development", "multilateral", "", "#1B4F8C", "/logos/donors/isfd.png"),
    ("ksrelief", "KSRelief", "King Salman Humanitarian Aid Centre", "humanitarian", "SA", "#006C35", "/logos/donors/ksrelief.png"),
    ("qffd", "QFFD", "Qatar Fund for Development", "bilateral", "QA", "#8A1538", "/logos/donors/qffd.png"),
]

# (code, nom, type, iso2 du pays ou None si international)
# Convention de codage des agences : <type_abrege>-<iso2_pays> pour les
# entites nationales (ex. minagri-sn), <sigle> pour les entites internationales.
# Le code est un slug unique, immuable apres creation (POL-1.05).
AGENCIES = [
    ("minsan-sn",      "Ministry of Health & Social Action",       "government",    "SN"),
    ("minsan-ml",      "Ministry of Health",                        "government",    "ML"),
    ("minsan-bf",      "Ministry of Health",                        "government",    "BF"),
    ("minsan-gn",      "Ministry of Health & Public Hygiene",       "government",    "GN"),
    ("minagri-ng",     "Kano State Ministry of Agriculture",        "government",    "NG"),
    ("minagri-sn",     "Ministry of Agriculture and Food Security", "government",    "SN"),
    ("minagri-ml",     "Ministry of Agriculture",                   "government",    "ML"),
    ("minagri-bf",     "Ministry of Agriculture",                   "government",    "BF"),
    ("knarda",         "KNARDA",                                    "national_agency","NG"),
    ("unicef",         "UNICEF",                                    "un_agency",     None),
    ("unfpa",          "UNFPA",                                     "un_agency",     None),
    ("who",            "WHO",                                       "un_agency",     None),
    ("fao",            "FAO",                                       "un_agency",     None),
    ("sos-sahel",      "SOS Sahel International",                   "ngo",           None),
    ("care-intl",      "CARE International",                        "ngo",           None),
]

# Two independent sector taxonomies (ADR 0014). LLF: the Fund's own three
# flat sectors, from the LLF sector mapping of September 2026; colours are the
# --sec-health / --sec-agri / --sec-infra design tokens.
# (code, sequence, name, icon, color)
LLF_SECTORS = [
    ("LLF_HEALTH", 1, "Health", "health", "#FB563B"),
    ("LLF_AGRI", 2, "Agriculture & Food Security", "agriculture", "#0EB584"),
    ("LLF_SOCINF", 3, "Social Infrastructure", "infrastructure", "#F49D07"),
]

# IsDB 2026-2030 sector taxonomy (called LLF2 before ADR 0014): three pillars
# and their sub-sectors, numbered as in the LLF2 results framework. Codes are the short LLF2 codes; the numbering
# is the `sequence` field, which drives the order without appearing in the name. The former slug sectors
# (health, agriculture, infrastructure, gender, climate, general_agriculture,
# sewerage_solid_waste, basic_infrastructure) were deleted from the maintained
# database on 5 September 2026 and are not seeded any more.
# (code, sequence, name, icon, color)
SECTORS = [
    ("INFRA", 10, "Productivity Enabling Infrastructure", "infrastructure", "#0089c5"),
    ("SOC", 20, "Human Capital Development", "generic", "#E84A5F"),
    ("RES", 30, "Resilience", "generic", "#A4C53F"),
]

# (code, sequence, name, parent_code, icon, color)
SUB_SECTORS = [
    ("TRA", 11, "Transport", "INFRA", "generic", "#0089c5"),
    ("ENER", 12, "Energy", "INFRA", "generic", "#0089c5"),
    ("DIG", 13, "Digital Infrastructure", "INFRA", "generic", "#0089c5"),
    ("RUR", 14, "Rural Development", "INFRA", "generic", "#0089c5"),
    ("EDU", 21, "Education", "SOC", "education", "#E84A5F"),
    ("HEALTH", 22, "Health", "SOC", "health", "#E84A5F"),
    ("AGRICU", 31, "Agriculture & Food Security", "RES", "agriculture", "#A4C53F"),
    ("WASH", 32, "Water & Sanitation", "RES", "water", "#A4C53F"),
]

# (numero, nom, couleur officielle ONU)
# Les pictogrammes officiels des ODD sont des marques de l'ONU soumises a des
# regles d'usage : le systeme affiche une tuile numerotee a la couleur
# officielle plutot que de reproduire le pictogramme.
SDGS = [
    (1, "No Poverty", "#E5243B"),
    (2, "Zero Hunger", "#DDA63A"),
    (3, "Good Health and Well-being", "#4C9F38"),
    (4, "Quality Education", "#C5192D"),
    (5, "Gender Equality", "#FF3A21"),
    (6, "Clean Water and Sanitation", "#26BDE2"),
    (7, "Affordable and Clean Energy", "#FCC30B"),
    (8, "Decent Work and Economic Growth", "#A21942"),
    (9, "Industry, Innovation and Infrastructure", "#FD6925"),
    (10, "Reduced Inequalities", "#DD1367"),
    (11, "Sustainable Cities and Communities", "#FD9D24"),
    (12, "Responsible Consumption and Production", "#BF8B2E"),
    (13, "Climate Action", "#3F7E44"),
    (14, "Life Below Water", "#0A97D9"),
    (15, "Life on Land", "#56C02B"),
    (16, "Peace, Justice and Strong Institutions", "#00689D"),
    (17, "Partnerships for the Goals", "#19486A"),
]

MARKERS = [
    ("gender_equality", "Gender equality (OECD-DAC)"),
    ("climate_mitigation", "Climate change mitigation (OECD-DAC)"),
    ("climate_adaptation", "Climate change adaptation (OECD-DAC)"),
    ("environment", "Environment (OECD-DAC)"),
    ("disability_inclusion", "Disability inclusion (OECD-DAC)"),
]

# Themes transversaux SF-2 (Module 1)
CROSS_CUTTING_THEMES = [
    ("climate",           "Climate"),
    ("fragility",         "Fragility"),
    ("youth_employment",  "Youth employment"),
    ("gender",            "Gender"),
    ("disability",        "Disability & inclusion"),
    ("migration",         "Migration"),
    ("digital_inclusion", "Digital inclusion"),
    ("nutrition",         "Nutrition"),
    ("governance",        "Governance"),
    ("food_security",     "Food security"),
]


class Command(BaseCommand):
    help = "Peuple les donnees de reference du portefeuille LLF2 (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        for code, name in CURRENCIES:
            Currency.objects.update_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Devises : {len(CURRENCIES)} OK"))

        hubs = {}
        for code, name, city, color in HUBS:
            hub, _ = RegionalHub.objects.get_or_create(
                code=code, defaults={"name": name, "city": city, "color": color}
            )
            # Met a jour les hubs deja crees par une version anterieure du seed
            # (qui n'avait ni ville ni couleur).
            if hub.city != city or hub.color != color or hub.name != name:
                hub.name, hub.city, hub.color = name, city, color
                hub.save(update_fields=["name", "city", "color"])
            hubs[code] = hub
        self.stdout.write(self.style.SUCCESS(f"Hubs regionaux : {len(hubs)} OK"))

        # Les pays sont rattaches aux nouveaux hubs par le bloc suivant ; ne
        # restent ici que les enveloppes vides de l'ancienne nomenclature.
        legacy = list(RegionalHub.objects.filter(code__in=LEGACY_HUB_CODES, is_active=True))
        if legacy:
            RegionalHub.objects.filter(pk__in=[h.pk for h in legacy]).update(is_active=False)
            self.stdout.write(
                self.style.WARNING(
                    "Hubs de l'ancienne nomenclature desactives : "
                    + ", ".join(sorted(h.code for h in legacy))
                )
            )

        countries = {}
        for iso2, iso3, name, hub_code in COUNTRIES:
            country, _ = Country.objects.update_or_create(
                iso3=iso3,
                defaults={"iso2": iso2, "name": name, "hub": hubs.get(hub_code)},
            )
            # Rattache les pays seedes precedemment sans hub.
            if country.hub_id is None and hub_code:
                country.hub = hubs[hub_code]
                country.save(update_fields=["hub"])
            countries[iso2] = country
        self.stdout.write(self.style.SUCCESS(f"Pays : {len(countries)} OK"))

        # Un pays sorti du referentiel n'est pas touche : l'ecarter du
        # portefeuille est une decision de gestion, pas un effet de bord du
        # seed. On se contente de le signaler.
        outside = (
            Country.objects.exclude(iso3__in=[iso3 for _, iso3, _, _ in COUNTRIES])
            .order_by("iso3")
            .values_list("iso3", flat=True)
        )
        if outside:
            self.stdout.write(
                self.style.WARNING(
                    f"Pays en base hors referentiel, laisses inchanges : {', '.join(outside)}"
                )
            )

        for code, short_name, name, donor_type, origin, color, logo in DONORS:
            donor, created = Donor.objects.get_or_create(
                code=code,
                defaults={
                    "short_name": short_name,
                    "name": name,
                    "donor_type": donor_type,
                    "origin_iso2": origin,
                    "color": color,
                    "logo_url": logo,
                },
            )
            # Complete les bailleurs seedes avant l'arrivee des logos, sans
            # ecraser un logo saisi manuellement.
            if not created and not donor.logo_url:
                donor.short_name = donor.short_name or short_name
                donor.donor_type = donor.donor_type or donor_type
                donor.origin_iso2 = donor.origin_iso2 or origin
                donor.color = donor.color or color
                donor.logo_url = logo
                donor.save()
        self.stdout.write(
            self.style.SUCCESS(f"Bailleurs : {len(DONORS)} OK (montants non renseignes)")
        )

        for code, name, agency_type, iso2 in AGENCIES:
            ImplementingAgency.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "agency_type": agency_type,
                    "country": countries.get(iso2) if iso2 else None,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Agences d'implementation : {len(AGENCIES)} OK"))

        for code, sequence, name, icon, color in LLF_SECTORS:
            Sector.objects.update_or_create(
                code=code,
                defaults={
                    "name": name, "sequence": sequence, "parent": None,
                    "icon": icon, "color": color, "taxonomy": "llf",
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Secteurs LLF : {len(LLF_SECTORS)} OK"))

        for code, sequence, name, icon, color in SECTORS:
            sector, _ = Sector.objects.update_or_create(
                code=code,
                defaults={
                    "name": name, "sequence": sequence, "parent": None,
                    "icon": icon, "color": color, "taxonomy": "isdb",
                },
            )
            # Complete les secteurs seedes avant l'ajout des champs icone/couleur.
            if not sector.color:
                sector.icon, sector.color = icon, color
                sector.save(update_fields=["icon", "color"])
        self.stdout.write(self.style.SUCCESS(f"Secteurs : {len(SECTORS)} OK"))

        for code, sequence, name, parent_code, icon, color in SUB_SECTORS:
            parent = Sector.objects.filter(code=parent_code).first()
            sector, _ = Sector.objects.update_or_create(
                code=code,
                defaults={
                    "name": name, "sequence": sequence, "parent": parent,
                    "icon": icon, "color": color, "taxonomy": "isdb",
                },
            )
            if not sector.color:
                sector.icon, sector.color = icon, color
                sector.save(update_fields=["icon", "color"])
        self.stdout.write(
            self.style.SUCCESS(f"Sous-secteurs : {len(SUB_SECTORS)} OK")
        )

        for number, name, color in SDGS:
            sdg, _ = Sdg.objects.update_or_create(number=number, defaults={"name": name, "color": color})
            if not sdg.color:
                sdg.color = color
                sdg.save(update_fields=["color"])
        self.stdout.write(self.style.SUCCESS(f"ODD : {len(SDGS)} OK"))

        for code, name in MARKERS:
            Marker.objects.update_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Marqueurs OECD-DAC : {len(MARKERS)} OK"))

        for code, name in CROSS_CUTTING_THEMES:
            CrossCuttingTheme.objects.update_or_create(code=code, defaults={"name": name})
        self.stdout.write(
            self.style.SUCCESS(f"Themes transversaux : {len(CROSS_CUTTING_THEMES)} OK")
        )

        self.stdout.write(
            self.style.WARNING(
                "\nLimites connues : le libelle de region du referentiel "
                "(West Africa, North East Africa...) n'est pas repris, faute de "
                "champ ou le stocker. Les sous-secteurs ne sont pas exhaustifs. "
                "A completer via l'ecran Donnees de base une fois les donnees "
                "officielles LLF2 disponibles."
            )
        )

"""
Peuple les donnees de reference du portefeuille LLF2 : devises, hubs
regionaux, pays, donateurs, agences d'implementation, secteurs, ODD,
marqueurs OECD-DAC, themes transversaux.

Source : demo statique Sentinelle (sentinelle-admin.html), qui portait les
donnees de portefeuille les plus completes disponibles, croisee avec les
specifications fonctionnelles anterieures.

LIMITES CONNUES (a lever avec les donnees officielles LLF2) :
  - 5 hubs sur 8. Le portefeuille compte 8 hubs (Abuja, Almaty, Ankara,
    Dakar, Dhaka, Jakarta, Kampala, Rabat) ; seuls 5 sont documentes avec
    leur composition pays. Almaty, Ankara et Jakarta sont absents faute de
    savoir quels pays leur rattacher.
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
    ("USD", "Dollar americain"),
    ("EUR", "Euro"),
]

# (code, nom, ville, couleur)
HUBS = [
    ("dakar", "Hub Senegal", "Dakar", "#A4C53F"),
    ("abuja", "Hub Nigeria", "Abuja", "#3F6CC5"),
    ("kampala", "Hub Afrique de l'Est", "Kampala", "#5BB39F"),
    ("rabat", "Hub Maghreb", "Rabat", "#C97FB0"),
    ("dhaka", "Hub Asie", "Dhaka", "#7B68C7"),
]

# (iso2, iso3, nom, code_hub)
COUNTRIES = [
    # Hub Senegal (Dakar)
    ("SN", "SEN", "Senegal", "dakar"),
    ("GM", "GMB", "Gambie", "dakar"),
    ("CI", "CIV", "Cote d'Ivoire", "dakar"),
    ("GN", "GIN", "Guinee", "dakar"),
    ("ML", "MLI", "Mali", "dakar"),
    ("SL", "SLE", "Sierra Leone", "dakar"),
    ("GW", "GNB", "Guinee-Bissau", "dakar"),
    # Hub Nigeria (Abuja)
    ("NG", "NGA", "Nigeria", "abuja"),
    ("BJ", "BEN", "Benin", "abuja"),
    ("TG", "TGO", "Togo", "abuja"),
    ("NE", "NER", "Niger", "abuja"),
    ("TD", "TCD", "Tchad", "abuja"),
    ("CM", "CMR", "Cameroun", "abuja"),
    ("BF", "BFA", "Burkina Faso", "abuja"),
    # Hub Afrique de l'Est (Kampala)
    ("UG", "UGA", "Ouganda", "kampala"),
    ("RW", "RWA", "Rwanda", "kampala"),
    ("BI", "BDI", "Burundi", "kampala"),
    ("MZ", "MOZ", "Mozambique", "kampala"),
    ("SD", "SDN", "Soudan", "kampala"),
    ("SS", "SSD", "Soudan du Sud", "kampala"),
    # Hub Maghreb (Rabat)
    ("MA", "MAR", "Maroc", "rabat"),
    ("MR", "MRT", "Mauritanie", "rabat"),
    ("EG", "EGY", "Egypte", "rabat"),
    ("YE", "YEM", "Yemen", "rabat"),
    ("DJ", "DJI", "Djibouti", "rabat"),
    # Hub Asie (Dhaka)
    ("BD", "BGD", "Bangladesh", "dhaka"),
    ("PK", "PAK", "Pakistan", "dhaka"),
    ("ID", "IDN", "Indonesie", "dhaka"),
    ("TJ", "TJK", "Tadjikistan", "dhaka"),
    ("MV", "MDV", "Maldives", "dhaka"),
]

# (code, sigle, nom, type, iso2 d'origine, couleur)
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
    ("adfd", "ADFD", "Abu Dhabi Fund for Development", "bilateral", "AE", "#C8102E"),
    ("gates", "GF", "Bill & Melinda Gates Foundation", "foundation", "US", "#222A35"),
    ("isdb", "IsDB", "Islamic Development Bank", "multilateral", "", "#0B5C3A"),
    ("isfd", "ISFD", "Islamic Solidarity Fund for Development", "multilateral", "", "#1B4F8C"),
    ("ksrelief", "KSRelief", "King Salman Humanitarian Aid Centre", "humanitarian", "SA", "#006C35"),
    ("qffd", "QFFD", "Qatar Fund for Development", "bilateral", "QA", "#8A1538"),
]

# (code, nom, type, iso2 du pays ou None si international)
AGENCIES = [
    ("minsan-sn", "Ministere de la Sante & de l'Action sociale", "government", "SN"),
    ("minsan-ml", "Ministere de la Sante", "government", "ML"),
    ("minsan-bf", "Ministere de la Sante", "government", "BF"),
    ("minsan-gn", "Ministere de la Sante & de l'Hygiene publique", "government", "GN"),
    ("minagri-ng", "Kano State Ministry of Agriculture", "government", "NG"),
    ("knarda", "KNARDA", "national_agency", "NG"),
    ("unicef", "UNICEF", "un_agency", None),
    ("unfpa", "UNFPA", "un_agency", None),
    ("who", "OMS", "un_agency", None),
    ("sos-sahel", "SOS Sahel International", "ngo", None),
]

# 3 piliers LLF2 + 2 themes transversaux
# (code, nom, icone, couleur) — couleurs reprises de la demo Sentinelle.
SECTORS = [
    ("health", "Sante primaire", "health", "#E84A5F"),
    ("agriculture", "Agriculture", "agriculture", "#A4C53F"),
    ("infrastructure", "Infrastructure de base", "infrastructure", "#3F6CC5"),
    ("gender", "Genre (transversal)", "gender", "#C97FB0"),
    ("climate", "Climat (transversal)", "climate", "#5BB39F"),
]

# Sous-secteurs confirmes dans les specifications anterieures. Liste NON
# exhaustive — seuls deux exemples ont ete formellement observes ; a
# completer via l'admin une fois la liste officielle LLF2 disponible.
SUB_SECTORS = [
    ("general_agriculture", "General Agriculture", "agriculture", "agriculture", "#A4C53F"),
    ("sewerage_solid_waste", "Sewerage & Solid Waste Management", "infrastructure", "water", "#3F6CC5"),
]

# (numero, nom, couleur officielle ONU)
# Les pictogrammes officiels des ODD sont des marques de l'ONU soumises a des
# regles d'usage : le systeme affiche une tuile numerotee a la couleur
# officielle plutot que de reproduire le pictogramme.
SDGS = [
    (1, "Pas de pauvrete", "#E5243B"),
    (2, "Faim 'zero'", "#DDA63A"),
    (3, "Bonne sante et bien-etre", "#4C9F38"),
    (4, "Education de qualite", "#C5192D"),
    (5, "Egalite entre les sexes", "#FF3A21"),
    (6, "Eau propre et assainissement", "#26BDE2"),
    (7, "Energie propre et d'un cout abordable", "#FCC30B"),
    (8, "Travail decent et croissance economique", "#A21942"),
    (9, "Industrie, innovation et infrastructure", "#FD6925"),
    (10, "Inegalites reduites", "#DD1367"),
    (11, "Villes et communautes durables", "#FD9D24"),
    (12, "Consommation et production responsables", "#BF8B2E"),
    (13, "Mesures relatives a la lutte contre les changements climatiques", "#3F7E44"),
    (14, "Vie aquatique", "#0A97D9"),
    (15, "Vie terrestre", "#56C02B"),
    (16, "Paix, justice et institutions efficaces", "#00689D"),
    (17, "Partenariats pour la realisation des objectifs", "#19486A"),
]

MARKERS = [
    ("gender_equality", "Egalite de genre (OECD-DAC)"),
    ("climate_mitigation", "Attenuation du changement climatique (OECD-DAC)"),
    ("climate_adaptation", "Adaptation au changement climatique (OECD-DAC)"),
    ("environment", "Environnement (OECD-DAC)"),
    ("disability_inclusion", "Inclusion du handicap (OECD-DAC)"),
]

# Themes transversaux SF-2 (Module 1)
CROSS_CUTTING_THEMES = [
    ("climate", "Climat"),
    ("fragility", "Fragilite"),
    ("youth_employment", "Emploi jeunes"),
    ("disability", "Handicap"),
    ("migration", "Migration"),
    ("digital_inclusion", "Inclusion numerique"),
]


class Command(BaseCommand):
    help = "Peuple les donnees de reference du portefeuille LLF2 (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        for code, name in CURRENCIES:
            Currency.objects.get_or_create(code=code, defaults={"name": name})
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
        self.stdout.write(self.style.SUCCESS(f"Hubs regionaux : {len(hubs)} OK (sur 8 au portefeuille)"))

        countries = {}
        for iso2, iso3, name, hub_code in COUNTRIES:
            country, _ = Country.objects.get_or_create(
                iso3=iso3,
                defaults={"iso2": iso2, "name": name, "hub": hubs.get(hub_code)},
            )
            # Rattache les pays seedes precedemment sans hub.
            if country.hub_id is None and hub_code:
                country.hub = hubs[hub_code]
                country.save(update_fields=["hub"])
            countries[iso2] = country
        self.stdout.write(self.style.SUCCESS(f"Pays : {len(countries)} OK"))

        for code, short_name, name, donor_type, origin, color in DONORS:
            donor, created = Donor.objects.get_or_create(
                code=code,
                defaults={
                    "short_name": short_name,
                    "name": name,
                    "donor_type": donor_type,
                    "origin_iso2": origin,
                    "color": color,
                },
            )
            if not created and not donor.short_name:
                donor.short_name = short_name
                donor.name = name
                donor.donor_type = donor_type
                donor.origin_iso2 = origin
                donor.color = color
                donor.save()
        self.stdout.write(
            self.style.SUCCESS(f"Bailleurs : {len(DONORS)} OK (montants non renseignes)")
        )

        for code, name, agency_type, iso2 in AGENCIES:
            ImplementingAgency.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "agency_type": agency_type,
                    "country": countries.get(iso2) if iso2 else None,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Agences d'implementation : {len(AGENCIES)} OK"))

        for code, name, icon, color in SECTORS:
            sector, _ = Sector.objects.get_or_create(
                code=code, defaults={"name": name, "parent": None, "icon": icon, "color": color}
            )
            # Complete les secteurs seedes avant l'ajout des champs icone/couleur.
            if not sector.color:
                sector.icon, sector.color = icon, color
                sector.save(update_fields=["icon", "color"])
        self.stdout.write(self.style.SUCCESS(f"Secteurs : {len(SECTORS)} OK"))

        for code, name, parent_code, icon, color in SUB_SECTORS:
            parent = Sector.objects.filter(code=parent_code).first()
            sector, _ = Sector.objects.get_or_create(
                code=code, defaults={"name": name, "parent": parent, "icon": icon, "color": color}
            )
            if not sector.color:
                sector.icon, sector.color = icon, color
                sector.save(update_fields=["icon", "color"])
        self.stdout.write(
            self.style.SUCCESS(f"Sous-secteurs : {len(SUB_SECTORS)} OK (liste non exhaustive)")
        )

        for number, name, color in SDGS:
            sdg, _ = Sdg.objects.get_or_create(number=number, defaults={"name": name, "color": color})
            if not sdg.color:
                sdg.color = color
                sdg.save(update_fields=["color"])
        self.stdout.write(self.style.SUCCESS(f"ODD : {len(SDGS)} OK"))

        for code, name in MARKERS:
            Marker.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Marqueurs OECD-DAC : {len(MARKERS)} OK"))

        for code, name in CROSS_CUTTING_THEMES:
            CrossCuttingTheme.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(
            self.style.SUCCESS(f"Themes transversaux : {len(CROSS_CUTTING_THEMES)} OK")
        )

        self.stdout.write(
            self.style.WARNING(
                "\nLimites connues : 5 hubs sur les 8 du portefeuille sont charges "
                "(Almaty, Ankara et Jakarta manquent — composition pays inconnue). "
                "Les sous-secteurs ne sont pas exhaustifs. A completer via "
                "l'ecran Donnees de base une fois les donnees officielles LLF2 "
                "disponibles."
            )
        )

"""
Peuple les donnees de reference du portefeuille LLF2 : devises, hubs
regionaux, pays, donateurs, secteurs, ODD, marqueurs OECD-DAC.

Source : donnees reelles du portefeuille LLF2 confirmees dans les
specifications fonctionnelles anterieures (newsletters LLF, 6 donateurs
confirmes). La liste des pays et le rattachement complet aux 8 hubs
regionaux ne sont PAS exhaustifs ici — seuls les rattachements certains
sont renseignes ; le reste est a completer/corriger via l'admin Django
une fois les donnees officielles LLF2 disponibles.

Idempotent : peut etre relancee sans creer de doublons (get_or_create).

Usage :
    python manage.py seed_reference_data
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.reference.models import Country, CrossCuttingTheme, Currency, Donor, Marker, RegionalHub, Sdg, Sector


DONORS = [
    ("adfd", "Abu Dhabi Fund for Development (ADFD)"),
    ("gates", "Gates Foundation"),
    ("isdb", "Islamic Development Bank (IsDB)"),
    ("isfd", "Islamic Solidarity Fund for Development (ISFD)"),
    ("ksrelief", "King Salman Humanitarian Aid and Relief Center (KSRelief)"),
    ("qffd", "Qatar Fund For Development (QFFD)"),
]

CURRENCIES = [
    ("USD", "Dollar americain"),
    ("EUR", "Euro"),
]

# Hubs regionaux confirmes (noms de ville-siege). Le portefeuille LLF2
# compte 8 hubs au total ; seuls ceux nommes explicitement dans les
# specifications anterieures sont charges ici.
HUBS = [
    ("dakar", "Hub Senegal (Dakar)"),
    ("abuja", "Hub Nigeria (Abuja)"),
    ("rabat", "Hub Maroc (Rabat)"),
    ("kampala", "Hub Ouganda (Kampala)"),
    ("dhaka", "Hub Asie du Sud (Dhaka)"),
]

# (iso2, iso3, nom, code_hub ou None si non confirme)
COUNTRIES = [
    ("SN", "SEN", "Senegal", "dakar"),
    ("GM", "GMB", "Gambie", "dakar"),
    ("CI", "CIV", "Cote d'Ivoire", "dakar"),
    ("GN", "GIN", "Guinee", "dakar"),
    ("ML", "MLI", "Mali", "dakar"),
    ("SL", "SLE", "Sierra Leone", "dakar"),
    ("GW", "GNB", "Guinee-Bissau", "dakar"),
    ("NG", "NGA", "Nigeria", "abuja"),
    ("BF", "BFA", "Burkina Faso", None),
    ("NE", "NER", "Niger", None),
    ("CM", "CMR", "Cameroun", None),
    ("BJ", "BEN", "Benin", None),
    ("TD", "TCD", "Tchad", None),
    ("MA", "MAR", "Maroc", "rabat"),
    ("UG", "UGA", "Ouganda", "kampala"),
    ("PK", "PAK", "Pakistan", None),
]

# 3 piliers LLF2 + 2 themes transversaux
SECTORS = [
    ("health", "Sante primaire", None),
    ("agriculture", "Agriculture", None),
    ("infrastructure", "Infrastructure de base", None),
    ("gender", "Genre (transversal)", None),
    ("climate", "Climat (transversal)", None),
]

# Sous-secteurs confirmes dans les specifications anterieures. Liste NON
# exhaustive — seuls deux exemples ont ete formellement observes ; a
# completer via l'admin une fois la liste officielle LLF2 disponible.
SUB_SECTORS = [
    ("general_agriculture", "General Agriculture", "agriculture"),
    ("sewerage_solid_waste", "Sewerage & Solid Waste Management", "infrastructure"),
]

SDGS = [
    (1, "Pas de pauvrete"),
    (2, "Faim 'zero'"),
    (3, "Bonne sante et bien-etre"),
    (4, "Education de qualite"),
    (5, "Egalite entre les sexes"),
    (6, "Eau propre et assainissement"),
    (7, "Energie propre et d'un cout abordable"),
    (8, "Travail decent et croissance economique"),
    (9, "Industrie, innovation et infrastructure"),
    (10, "Inegalites reduites"),
    (11, "Villes et communautes durables"),
    (12, "Consommation et production responsables"),
    (13, "Mesures relatives a la lutte contre les changements climatiques"),
    (14, "Vie aquatique"),
    (15, "Vie terrestre"),
    (16, "Paix, justice et institutions efficaces"),
    (17, "Partenariats pour la realisation des objectifs"),
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
        currencies = {
            code: Currency.objects.get_or_create(code=code, defaults={"name": name})[0]
            for code, name in CURRENCIES
        }
        self.stdout.write(self.style.SUCCESS(f"Devises : {len(currencies)} OK"))

        hubs = {
            code: RegionalHub.objects.get_or_create(code=code, defaults={"name": name})[0]
            for code, name in HUBS
        }
        self.stdout.write(self.style.SUCCESS(f"Hubs regionaux : {len(hubs)} OK"))

        country_count = 0
        for iso2, iso3, name, hub_code in COUNTRIES:
            Country.objects.get_or_create(
                iso2=iso2,
                defaults={
                    "iso3": iso3,
                    "name": name,
                    "hub": hubs.get(hub_code) if hub_code else None,
                },
            )
            country_count += 1
        self.stdout.write(self.style.SUCCESS(f"Pays : {country_count} OK"))

        for code, name in DONORS:
            Donor.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Donateurs : {len(DONORS)} OK"))

        for code, name, parent_code in SECTORS:
            Sector.objects.get_or_create(code=code, defaults={"name": name, "parent": None})
        self.stdout.write(self.style.SUCCESS(f"Secteurs : {len(SECTORS)} OK"))

        sub_sector_count = 0
        for code, name, parent_code in SUB_SECTORS:
            parent = Sector.objects.filter(code=parent_code).first()
            Sector.objects.get_or_create(code=code, defaults={"name": name, "parent": parent})
            sub_sector_count += 1
        self.stdout.write(self.style.SUCCESS(f"Sous-secteurs : {sub_sector_count} OK (liste non exhaustive)"))

        for number, name in SDGS:
            Sdg.objects.get_or_create(number=number, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"ODD : {len(SDGS)} OK"))

        for code, name in MARKERS:
            Marker.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Marqueurs OECD-DAC : {len(MARKERS)} OK"))

        for code, name in CROSS_CUTTING_THEMES:
            CrossCuttingTheme.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"Themes transversaux : {len(CROSS_CUTTING_THEMES)} OK"))

        self.stdout.write(
            self.style.WARNING(
                "\nRappel : cette liste de pays/hubs n'est pas exhaustive "
                "(portefeuille LLF2 = 22+ pays, 8 hubs). Les rattachements "
                "pays->hub non confirmes sont laisses vides (None) — a "
                "completer via l'admin Django une fois les donnees "
                "officielles disponibles."
            )
        )

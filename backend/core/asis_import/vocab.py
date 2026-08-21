"""
Vocabulaires acceptes par l'import (design §8) et correspondances entre le
langage du classeur et les litteraux du modele (plan §3).

Les ensembles de valeurs valides sont DERIVES des modeles, jamais recopies :
si une liste de choix change, le validateur suit sans intervention. C'est la
seule facon de garantir qu'un fichier accepte ici est ecrivable la-bas.

Les correspondances, elles, sont des decisions — confirmees avec le
developpeur le 21 aout 2026. Chacune declenche un avertissement sur la ligne
ou elle s'applique : une valeur traduite silencieusement est une valeur que
personne ne relit.
"""
from apps.project.models import (
    FRAGILITY_STATUS_CHOICES,
    GENDER_MARKER_CHOICES,
    GEOGRAPHIC_TYPOLOGY_CHOICES,
    IMPLEMENTATION_MODALITY_CHOICES,
    LIFECYCLE_STAGE_CHOICES,
    PARTNER_ROLE_CHOICES,
    RIO_MARKER_CHOICES,
    RISK_RATING_CHOICES,
    FINANCING_INSTRUMENT_CHOICES,
    FINANCING_SOURCE_CHOICES,
    Project,
)
from apps.reference.models import ImplementingAgency
from apps.results.models import (
    CHAIN_LEVEL_WITH_IMPACT_CHOICES,
    DIRECTION_CHOICES,
    MEASUREMENT_FREQUENCY_CHOICES,
)
from apps.workplan.models import (
    ACTIVITY_STATUS_CHOICES,
    MILESTONE_CATEGORY_CHOICES,
    MILESTONE_STATUS_CHOICES,
)


def _literals(choices):
    return {value for value, _label in choices}


# --- Ensembles derives des modeles -----------------------------------------

LIFECYCLE_STAGES = _literals(LIFECYCLE_STAGE_CHOICES)
GENDER_MARKERS = _literals(GENDER_MARKER_CHOICES)
RIO_MARKERS = _literals(RIO_MARKER_CHOICES)
IMPLEMENTATION_MODALITIES = _literals(IMPLEMENTATION_MODALITY_CHOICES)
GEOGRAPHIC_TYPOLOGIES = _literals(GEOGRAPHIC_TYPOLOGY_CHOICES)
FRAGILITY_STATUSES = _literals(FRAGILITY_STATUS_CHOICES)
RISK_RATINGS = _literals(RISK_RATING_CHOICES)
REPORTING_FREQUENCIES = _literals(Project.REPORTING_FREQUENCY_CHOICES)
FINANCING_SOURCES = _literals(FINANCING_SOURCE_CHOICES)
FINANCING_INSTRUMENTS = _literals(FINANCING_INSTRUMENT_CHOICES)
PARTNER_ROLES = _literals(PARTNER_ROLE_CHOICES)
AGENCY_TYPES = _literals(ImplementingAgency.AGENCY_TYPE_CHOICES)
CHAIN_LEVELS = _literals(CHAIN_LEVEL_WITH_IMPACT_CHOICES)
DIRECTIONS = _literals(DIRECTION_CHOICES)
MEASUREMENT_FREQUENCIES = _literals(MEASUREMENT_FREQUENCY_CHOICES)
ACTIVITY_STATUSES = _literals(ACTIVITY_STATUS_CHOICES)
MILESTONE_STATUSES = _literals(MILESTONE_STATUS_CHOICES)
MILESTONE_CATEGORIES = _literals(MILESTONE_CATEGORY_CHOICES)


# --- Correspondances classeur -> modele (plan §3) --------------------------

# `04_agencies.agency_type_note`. Le classeur decrit une fonction ("pmu",
# "technical partner"), le modele une nature juridique. Aucune des deux
# n'est traduisible sans perte : on trace la traduction.
AGENCY_TYPE_MAP = {
    "government": "government",
    "national agency": "national_agency",
    "pmu": "national_agency",
    "private": "private",
    "technical partner": "ngo",
    "ngo": "ngo",
    "un agency": "un_agency",
}

# `05_project_partners.role`. PARTNER_ROLE_CHOICES n'a pas de "pmu" ;
# co_executor est le plus proche sans inventer de role.
PARTNER_ROLE_MAP = {
    "lead": "lead",
    "pmu": "co_executor",
    "implementing": "co_executor",
    "co-executing": "co_executor",
    "technical": "technical_partner",
    "technical partner": "technical_partner",
    "fiduciary": "fiduciary",
    "government": "government",
}

# `09_components.level` : choisit le modele cible, pas une valeur de champ.
COMPONENT_LEVEL_MAP = {
    "component": "component",
    "sub-component": "sub_component",
    "subcomponent": "sub_component",
    "sub component": "sub_component",
}

# Categorie par defaut des jalons : le classeur n'a pas de colonne
# `category` alors que le modele l'exige. Les six jalons SLE1013 sont des
# echeances contractuelles (signature, entree en vigueur, decaissements,
# rapport d'achevement) — d'ou ce defaut, signale ligne par ligne.
DEFAULT_MILESTONE_CATEGORY = "contractual"


def normalise(value):
    """Forme de comparaison d'une valeur de vocabulaire venue du classeur."""
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().replace("_", " ").split())


def map_value(mapping, raw):
    """
    Traduit `raw` via `mapping`. Renvoie (valeur, traduite) ou
    (None, False) si aucune correspondance — l'appelant decide si c'est
    une erreur ou un avertissement.
    """
    key = normalise(raw)
    if key in mapping:
        value = mapping[key]
        # `traduite` distingue "reconnue telle quelle" de "reinterpretee",
        # pour n'avertir que dans le second cas.
        return value, normalise(value) != key
    return None, False

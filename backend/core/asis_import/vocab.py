"""
Vocabularies the import accepts (design §8) and the mappings between the
workbook's language and the model's literals (plan §3).

The sets of valid values are DERIVED from the models, never retyped: if a
choice list changes, the validator follows without intervention. That is the
only way to guarantee a file accepted here is writable there.

The mappings are decisions — confirmed with the developer on 21 August 2026.
Each one raises a warning on the row where it applies: a value translated
silently is a value nobody reviews.
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


# --- Sets derived from the models ------------------------------------------

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


# --- Workbook -> model mappings (plan §3) ----------------------------------

# `04_agencies.agency_type_note`. The workbook describes a function ("pmu",
# "technical partner"), the model a legal nature. Neither translates to the
# other without loss, so the translation is reported.
AGENCY_TYPE_MAP = {
    "government": "government",
    "national agency": "national_agency",
    "pmu": "national_agency",
    "private": "private",
    "technical partner": "ngo",
    "ngo": "ngo",
    "un agency": "un_agency",
}

# `05_project_partners.role`. PARTNER_ROLE_CHOICES has no "pmu";
# co_executor is the closest without inventing a role.
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

# `09_components.level`: picks the target model, not a field value.
COMPONENT_LEVEL_MAP = {
    "component": "component",
    "sub-component": "sub_component",
    "subcomponent": "sub_component",
    "sub component": "sub_component",
}

# Default milestone category: the workbook has no `category` column while
# the model requires one. The six SLE1013 milestones are contractual
# deadlines (signature, effectiveness, disbursements, completion report) —
# hence this default, reported once per sheet.
DEFAULT_MILESTONE_CATEGORY = "contractual"


def normalise(value):
    """Comparison form of a vocabulary value coming from the workbook."""
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().replace("_", " ").split())


def map_value(mapping, raw):
    """
    Translate `raw` through `mapping`. Returns (value, translated) or
    (None, False) if there is no match — the caller decides whether that is
    an error or a warning.
    """
    key = normalise(raw)
    if key in mapping:
        value = mapping[key]
        # `translated` separates "recognised as-is" from "reinterpreted",
        # so that only the second case warns.
        return value, normalise(value) != key
    return None, False

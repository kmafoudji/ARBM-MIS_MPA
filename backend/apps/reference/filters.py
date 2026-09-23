"""Query filters shared by the views that take a project type and a sector.

ADR 0014: a view that spans projects shows one type at a time, LLF or IsDB,
and its sector filter speaks that type's taxonomy. ADR 0007: in the IsDB
taxonomy, a pillar id stands for its sectors.
"""
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from .models import TAXONOMY_CHOICES, TAXONOMY_LLF

TYPE_PARAM = "type"


def read_project_type(params, default=TAXONOMY_LLF, name=TYPE_PARAM):
    """The `?type=` of a request, `llf` or `isdb`; `llf` when absent.

    `name` renames the parameter where `type` already means something else.
    """
    value = params.get(name) or default
    if value not in dict(TAXONOMY_CHOICES):
        raise ValidationError({name: "Expected llf or isdb."})
    return value


def read_sector_id(params, name="sector"):
    """A sector id from the query string, or None; 400 if it is not a number."""
    value = params.get(name)
    if not value:
        return None
    if not str(value).isdigit():
        raise ValidationError({name: "Expected a sector id."})
    return int(value)


def sector_q(field, sector_id):
    """`field` is `sector_id`, or `sector_id` is its pillar (ADR 0007)."""
    return Q(**{f"{field}_id": sector_id}) | Q(**{f"{field}__parent_id": sector_id})


def indicator_sector_field(project_type):
    """The indicator field holding the sector of a taxonomy."""
    return "llf_sector" if project_type == TAXONOMY_LLF else "sector"

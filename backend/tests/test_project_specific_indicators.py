"""
Tests for the lifetime of a `project_specific` indicator.

An indicator the AS-IS import created has no reason to outlive the project
that brought it: its code was not in the catalogue, and once the project is
gone nothing links it to anything. The catalogue kept 11 such rows from a
deleted project before this behaviour existed.

What ties the indicator to the project is `LogframeRow`, not a foreign key on
`Indicator` — hence the pre_delete/post_delete pair in `apps.results.models`,
and hence these tests, which exercise a real cascade rather than a call.
"""
import pytest

from apps.results.models import Indicator, LogframeRow
from tests.factories import ProjectFactory, SectorFactory


def make_indicator(code, indicator_type):
    return Indicator.objects.create(
        code=code,
        sector=SectorFactory(),
        name=f"Indicator {code}",
        indicator_type=indicator_type,
        direction="increase",
        definition="A definition.",
        unit="Number",
    )


@pytest.mark.django_db
def test_deleting_a_project_deletes_its_project_specific_indicators():
    project = ProjectFactory()
    indicator = make_indicator("PSI001-IND-01", "project_specific")
    LogframeRow.objects.create(project=project, indicator=indicator, chain_level="output")

    project.delete()

    assert not Indicator.objects.filter(code="PSI001-IND-01").exists()


@pytest.mark.django_db
def test_deleting_a_project_leaves_the_institutional_catalogue_alone():
    """
    The seeded catalogue rows carry a chain level in `indicator_type`; whatever
    the value, an indicator that is not `project_specific` is the LLFMU's, and
    a project that used it does not take it away (POL-2.01).
    """
    project = ProjectFactory()
    institutional = make_indicator("INST.1", "output")
    LogframeRow.objects.create(project=project, indicator=institutional, chain_level="output")

    project.delete()

    assert Indicator.objects.filter(code="INST.1").exists()


@pytest.mark.django_db
def test_an_indicator_a_second_project_still_uses_survives():
    """
    Deleting it would take the logframe row of a project that is still there.
    Nothing in the loader creates this case today — the guard is what makes it
    safe if someone attaches an imported indicator to a second project.
    """
    first = ProjectFactory()
    second = ProjectFactory()
    shared = make_indicator("PSI002-IND-01", "project_specific")
    LogframeRow.objects.create(project=first, indicator=shared, chain_level="output")
    LogframeRow.objects.create(project=second, indicator=shared, chain_level="output")

    first.delete()

    assert Indicator.objects.filter(code="PSI002-IND-01").exists()
    assert LogframeRow.objects.filter(project=second, indicator=shared).exists()


@pytest.mark.django_db
def test_a_project_without_indicators_deletes_cleanly():
    """The receivers must not assume the project had a logframe."""
    project = ProjectFactory()
    orphan = make_indicator("PSI003-IND-01", "project_specific")

    project.delete()

    # Nothing linked it to the deleted project, so nothing touches it.
    assert Indicator.objects.filter(pk=orphan.pk).exists()

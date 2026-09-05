import pytest
from django.core.management import call_command
from apps.reference.models import Sector


@pytest.mark.django_db
def test_seed_reference_data_ships_llf2_sectors_in_sequence():
    call_command("seed_reference_data")
    call_command("seed_reference_data")  # idempotent
    sectors = list(Sector.objects.all())  # Meta.ordering
    assert len(sectors) == 11
    assert [s.sequence for s in sectors] == [10, 11, 12, 13, 14, 20, 21, 22, 30, 31, 32]
    assert not any(s.name[:1].isdigit() for s in sectors)
    assert Sector.objects.filter(name__icontains="Agriculture").count() == 1  # seed_indicators lookup

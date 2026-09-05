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


@pytest.mark.django_db
def test_seed_reference_data_ships_three_pillars_with_eight_sectors():
    call_command("seed_reference_data")
    pillars = Sector.objects.filter(parent__isnull=True).order_by("sequence")
    assert [p.name for p in pillars] == [
        "Productivity Enabling Infrastructure",
        "Human Capital Development",
        "Resilience",
    ]
    assert [p.children.count() for p in pillars] == [4, 2, 2]
    assert all(p.is_pillar for p in pillars)
    wash = Sector.objects.get(code="WASH")
    assert not wash.is_pillar
    assert wash.pillar.code == "RES"


@pytest.mark.django_db
def test_sector_api_filters_by_level_and_parent():
    from rest_framework.test import APIClient
    from tests.factories import UserFactory

    call_command("seed_reference_data")
    client = APIClient()
    client.force_authenticate(user=UserFactory())

    pillars = client.get("/api/reference/sectors/?level=pillar").data
    assert [s["code"] for s in pillars] == ["INFRA", "SOC", "RES"]
    assert all(s["is_pillar"] for s in pillars)

    infra_id = pillars[0]["id"]
    children = client.get(f"/api/reference/sectors/?parent={infra_id}").data
    assert [s["code"] for s in children] == ["TRA", "ENER", "DIG", "RUR"]
    assert children[0]["pillar_name"] == "Productivity Enabling Infrastructure"
    assert not children[0]["is_pillar"]

    assert len(client.get("/api/reference/sectors/?level=sector").data) == 8

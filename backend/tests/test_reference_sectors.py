import pytest
from django.core.management import call_command
from apps.reference.models import Sector


@pytest.mark.django_db
def test_seed_reference_data_ships_llf2_sectors_in_sequence():
    call_command("seed_reference_data")
    call_command("seed_reference_data")  # idempotent
    sectors = list(Sector.objects.filter(taxonomy="isdb"))  # Meta.ordering
    assert len(sectors) == 11
    assert [s.sequence for s in sectors] == [10, 11, 12, 13, 14, 20, 21, 22, 30, 31, 32]
    assert not any(s.name[:1].isdigit() for s in sectors)
    # seed_indicators looks the IsDB sector up by name
    assert Sector.objects.filter(taxonomy="isdb", name__icontains="Agriculture").count() == 1


@pytest.mark.django_db
def test_seed_reference_data_ships_three_flat_llf_sectors():
    """ADR 0014: the Fund's own classification, independent of the IsDB one."""
    call_command("seed_reference_data")
    call_command("seed_reference_data")  # idempotent
    llf = list(Sector.objects.filter(taxonomy="llf"))
    assert [s.code for s in llf] == ["LLF_HEALTH", "LLF_AGRI", "LLF_SOCINF"]
    assert [s.name for s in llf] == ["Health", "Agriculture & Food Security", "Social Infrastructure"]
    assert all(s.parent_id is None and not s.is_pillar and s.pillar is None for s in llf)


@pytest.mark.django_db
def test_seed_reference_data_ships_three_pillars_with_eight_sectors():
    call_command("seed_reference_data")
    pillars = Sector.objects.filter(taxonomy="isdb", parent__isnull=True).order_by("sequence")
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

    # The three flat LLF sectors are sectors too (ADR 0014).
    assert len(client.get("/api/reference/sectors/?level=sector").data) == 11
    assert len(client.get("/api/reference/sectors/?level=sector&taxonomy=isdb").data) == 8
    llf = client.get("/api/reference/sectors/?taxonomy=llf").data
    assert [s["code"] for s in llf] == ["LLF_HEALTH", "LLF_AGRI", "LLF_SOCINF"]
    assert all(s["taxonomy"] == "llf" and not s["is_pillar"] and s["pillar_name"] is None for s in llf)
    assert client.get("/api/reference/sectors/?taxonomy=other").status_code == 400


@pytest.mark.django_db
def test_sector_api_keeps_llf_flat_and_pillars_within_their_taxonomy():
    from rest_framework.test import APIClient
    from tests.factories import SectorFactory, UserFactory

    client = APIClient()
    client.force_authenticate(user=UserFactory(is_superuser=True, is_staff=True))
    llf = SectorFactory(taxonomy="llf")
    isdb_pillar = SectorFactory(taxonomy="isdb")

    resp = client.patch(f"/api/reference/sectors/{llf.id}/", {"parent": isdb_pillar.id}, format="json")
    assert resp.status_code == 400
    resp = client.post(
        "/api/reference/sectors/",
        {"code": "X1", "name": "X", "taxonomy": "llf", "parent": llf.id}, format="json",
    )
    assert resp.status_code == 400
    resp = client.post(
        "/api/reference/sectors/",
        {"code": "X2", "name": "X", "taxonomy": "isdb", "parent": isdb_pillar.id}, format="json",
    )
    assert resp.status_code == 201, resp.data

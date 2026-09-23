"""
Tests — official reference number as the user-facing project identifier.

The reference is required and unique at creation and on the basic-info
update; it is the only identifier besides the database id (the internal
`code` and the `acronym` were removed in September 2026).
"""
import pytest
from rest_framework.test import APIClient
from apps.project.models import Project
from tests.factories import ProjectFactory, UserFactory, CountryFactory, SectorFactory


@pytest.fixture
def auth_client():
    client = APIClient()
    user = UserFactory(is_superuser=True, is_staff=True)
    client.force_authenticate(user=user)
    return client, user


def _payload(**overrides):
    country = CountryFactory()
    sector = SectorFactory()
    base = {
        "name": "Reference Test",
        "official_reference_number": "SLE1013",
        "country_ids": [country.id],
        "lead_country_id": country.id,
        "primary_sector": sector.id,
        "investment_cycle": "IsDB",
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
class TestCreate:

    def test_reference_is_required(self, auth_client):
        client, _ = auth_client
        payload = _payload()
        del payload["official_reference_number"]
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 400
        assert "official_reference_number" in resp.data

    def test_blank_reference_is_rejected(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/projects/", _payload(official_reference_number="   "), format="json")
        assert resp.status_code == 400
        assert "official_reference_number" in resp.data

    def test_duplicate_reference_is_rejected(self, auth_client):
        client, _ = auth_client
        ProjectFactory(official_reference_number="SLE1013")
        resp = client.post("/api/projects/", _payload(), format="json")
        assert resp.status_code == 400
        assert "already exists" in str(resp.data["official_reference_number"])

    def test_reference_is_stripped_and_stored(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/projects/", _payload(official_reference_number="  NGA1007 "), format="json")
        assert resp.status_code == 201
        from apps.project.models import Project
        assert Project.objects.get(pk=resp.data["id"]).official_reference_number == "NGA1007"


@pytest.mark.django_db
class TestBasicUpdate:

    def test_blanking_reference_returns_400(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(official_reference_number="CIV1008")
        resp = client.patch(
            f"/api/projects/{project.id}/basic/",
            {"official_reference_number": ""}, format="json",
        )
        assert resp.status_code == 400
        project.refresh_from_db()
        assert project.official_reference_number == "CIV1008"

    def test_duplicate_reference_returns_400(self, auth_client):
        client, _ = auth_client
        ProjectFactory(official_reference_number="MLI1020")
        project = ProjectFactory(official_reference_number="CIV1008")
        resp = client.patch(
            f"/api/projects/{project.id}/basic/",
            {"official_reference_number": "MLI1020"}, format="json",
        )
        assert resp.status_code == 400

    def test_own_reference_is_accepted(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(official_reference_number="CIV1008")
        resp = client.patch(
            f"/api/projects/{project.id}/basic/",
            {"official_reference_number": " CIV1008 ", "name": "Renamed"}, format="json",
        )
        assert resp.status_code == 200
        project.refresh_from_db()
        assert project.name == "Renamed"
        assert project.official_reference_number == "CIV1008"


@pytest.mark.django_db
class TestExposure:

    def test_list_carries_reference(self, auth_client):
        client, _ = auth_client
        ProjectFactory(official_reference_number="BEN1015")
        resp = client.get("/api/projects/")
        assert resp.status_code == 200
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        assert "BEN1015" in [r["official_reference_number"] for r in rows]

    def test_alert_project_code_is_the_reference(self):
        from apps.workplan.serializers import WorkplanAlertSerializer
        from apps.workplan.models import WorkplanAlert
        project = ProjectFactory(official_reference_number="BEN1015")
        alert = WorkplanAlert(project=project)
        assert WorkplanAlertSerializer(alert).data["project_code"] == "BEN1015"


@pytest.mark.django_db
class TestInvestmentCycle:
    """The cycle is the project type (ADR 0014): required at creation, fixed after."""

    def test_create_with_cycle(self, auth_client):
        client, _ = auth_client
        llf = SectorFactory(taxonomy="llf")
        resp = client.post(
            "/api/projects/", _payload(investment_cycle="LLF2", primary_sector=llf.id), format="json"
        )
        assert resp.status_code == 201, resp.data
        project = Project.objects.get(pk=resp.data["id"])
        assert project.investment_cycle == "LLF2"
        assert project.taxonomy == "llf"
        assert client.get(f"/api/projects/{project.id}/").data["taxonomy"] == "llf"

    def test_create_isdb_project(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/projects/", _payload(investment_cycle="IsDB"), format="json")
        assert resp.status_code == 201, resp.data
        assert Project.objects.get(pk=resp.data["id"]).taxonomy == "isdb"

    def test_create_rejects_unknown_cycle(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/projects/", _payload(investment_cycle="LLF3"), format="json")
        assert resp.status_code == 400
        assert "investment_cycle" in resp.data

    def test_cycle_is_required(self, auth_client):
        client, _ = auth_client
        payload = _payload()
        del payload["investment_cycle"]
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 400
        assert "investment_cycle" in resp.data

    @pytest.mark.parametrize("value", ["LLF2", "IsDB", ""])
    def test_basic_update_never_changes_the_cycle(self, auth_client, value):
        client, _ = auth_client
        project = ProjectFactory(official_reference_number="CIV1008", investment_cycle="LLF1")
        resp = client.patch(f"/api/projects/{project.id}/basic/", {"investment_cycle": value}, format="json")
        assert resp.status_code == 400
        assert "fixed at creation" in str(resp.data["investment_cycle"])
        project.refresh_from_db()
        assert project.investment_cycle == "LLF1"

    def test_basic_update_accepts_the_unchanged_cycle(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(official_reference_number="CIV1008", investment_cycle="LLF1")
        resp = client.patch(
            f"/api/projects/{project.id}/basic/",
            {"investment_cycle": "LLF1", "name": "Renamed"}, format="json",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["name"] == "Renamed"

    def test_classification_update_ignores_the_cycle(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(investment_cycle="LLF1")
        resp = client.patch(f"/api/projects/{project.id}/", {"investment_cycle": "IsDB"}, format="json")
        assert resp.status_code == 200
        project.refresh_from_db()
        assert project.investment_cycle == "LLF1"


@pytest.mark.django_db
class TestSectorTaxonomy:
    """A project only takes sectors of its own taxonomy (ADR 0014)."""

    def test_create_rejects_a_sector_of_the_other_taxonomy(self, auth_client):
        client, _ = auth_client
        isdb = SectorFactory(taxonomy="isdb")
        resp = client.post(
            "/api/projects/", _payload(investment_cycle="LLF1", primary_sector=isdb.id), format="json"
        )
        assert resp.status_code == 400
        assert "primary_sector" in resp.data

    def test_create_rejects_a_contributing_sector_of_the_other_taxonomy(self, auth_client):
        client, _ = auth_client
        llf = SectorFactory(taxonomy="llf")
        resp = client.post(
            "/api/projects/",
            _payload(investment_cycle="IsDB", contributing_sector_ids=[llf.id]), format="json",
        )
        assert resp.status_code == 400
        assert "contributing_sector_ids" in resp.data

    def test_classification_rejects_a_sector_of_the_other_taxonomy(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(investment_cycle="IsDB")
        llf = SectorFactory(taxonomy="llf")
        resp = client.patch(f"/api/projects/{project.id}/", {"primary_sector": llf.id}, format="json")
        assert resp.status_code == 400
        resp = client.patch(
            f"/api/projects/{project.id}/", {"contributing_sector_ids": [llf.id]}, format="json"
        )
        assert resp.status_code == 400

    def test_basic_update_rejects_a_sector_of_the_other_taxonomy(self, auth_client):
        client, _ = auth_client
        llf = SectorFactory(taxonomy="llf")
        project = ProjectFactory(investment_cycle="LLF1", primary_sector=llf)
        isdb = SectorFactory(taxonomy="isdb")
        resp = client.patch(f"/api/projects/{project.id}/basic/", {"primary_sector": isdb.id}, format="json")
        assert resp.status_code == 400
        resp = client.patch(
            f"/api/projects/{project.id}/basic/", {"contributing_sector_ids": [isdb.id]}, format="json"
        )
        assert resp.status_code == 400
        project.refresh_from_db()
        assert project.primary_sector == llf

    def test_basic_update_rejects_a_pillar(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(investment_cycle="IsDB")
        pillar = SectorFactory(taxonomy="isdb")
        SectorFactory(taxonomy="isdb", parent=pillar)
        resp = client.patch(f"/api/projects/{project.id}/basic/", {"primary_sector": pillar.id}, format="json")
        assert resp.status_code == 400

    def test_llf_project_has_no_pillar(self, auth_client):
        client, _ = auth_client
        project = ProjectFactory(investment_cycle="LLF1", primary_sector=SectorFactory(taxonomy="llf"))
        resp = client.get(f"/api/projects/{project.id}/")
        assert resp.data["pillar_id"] is None
        assert resp.data["pillar_name"] is None

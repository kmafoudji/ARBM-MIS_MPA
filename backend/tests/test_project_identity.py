"""
Tests — official reference number as the user-facing project identifier.

The reference is required and unique at creation and on the basic-info
update; the internal `code` and `acronym` stay in the model but are not what
users see.
"""
import pytest
from rest_framework.test import APIClient
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

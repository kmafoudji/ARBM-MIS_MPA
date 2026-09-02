"""
Tests API — Endpoints projet (SF-1, SF-2, SF-6).
"""
import pytest
from rest_framework.test import APIClient
from tests.factories import ProjectFactory, UserFactory, SectorFactory, CountryFactory


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def auth_client():
    client = APIClient()
    user = UserFactory()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
class TestProjectCreate:

    def test_unauthenticated_returns_401(self, client):
        resp = client.post("/api/projects/", {})
        assert resp.status_code in (401, 403)  # DRF/SessionAuth retourne 403

    def test_create_project_minimal(self, auth_client):
        client, user = auth_client
        sector = SectorFactory()
        country = CountryFactory()
        payload = {
            "name": "Test Project SF-1",
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 201
        assert resp.data["id"] is not None
        assert resp.data["name"] == "Test Project SF-1"

    def test_create_project_sets_concept_note_stage(self, auth_client):
        client, user = auth_client
        sector = SectorFactory()
        country = CountryFactory()
        payload = {
            "name": "Stage Test",
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 201
        # Vérifier en base
        from apps.project.models import Project
        project = Project.objects.get(pk=resp.data["id"])
        assert project.lifecycle_stage == "concept_note"

    def test_create_project_sets_created_by(self, auth_client):
        client, user = auth_client
        sector = SectorFactory()
        country = CountryFactory()
        payload = {
            "name": "Creator Test",
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 201
        from apps.project.models import Project
        project = Project.objects.get(pk=resp.data["id"])
        assert project.created_by == user

    def test_create_project_without_name_fails(self, auth_client):
        client, user = auth_client
        sector = SectorFactory()
        country = CountryFactory()
        payload = {
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestProjectClassification:

    def test_patch_classification(self, auth_client):
        client, user = auth_client
        from tests.factories import SdgFactory
        project = ProjectFactory()
        sdg = SdgFactory(number=3)
        payload = {
            "primary_sdg": sdg.number,
            "gender_marker": "1",
            "implementation_modality": "direct",
            "geographic_typology": "rural",
            "fragility_status": "stable",
            "risk_rating": "low",
        }
        resp = client.patch(f"/api/projects/{project.id}/", payload, format="json")
        assert resp.status_code == 200
        project.refresh_from_db()
        assert project.gender_marker == "1"
        assert project.fragility_status == "stable"

    def test_primary_sdg_cannot_be_contributing(self, auth_client):
        client, user = auth_client
        from tests.factories import SdgFactory
        project = ProjectFactory()
        sdg = SdgFactory(number=5)
        payload = {
            "primary_sdg": sdg.number,
            "contributing_sdg_ids": [sdg.number],
        }
        resp = client.patch(f"/api/projects/{project.id}/", payload, format="json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestProjectList:

    def test_list_returns_projects(self, auth_client):
        client, user = auth_client
        ProjectFactory.create_batch(3)
        resp = client.get("/api/projects/")
        assert resp.status_code == 200
        assert len(resp.data) >= 3

    def test_list_unauthenticated_returns_401(self, client):
        resp = client.get("/api/projects/")
        assert resp.status_code in (401, 403)  # DRF/SessionAuth retourne 403


@pytest.mark.django_db
class TestStageTransitionAPI:

    def test_transition_via_api(self, auth_client):
        client, user = auth_client
        project = ProjectFactory(lifecycle_stage="concept_note")
        payload = {
            "to_stage": "pipeline_taskforce_review",
            "transition_date": "2026-07-01",
        }
        resp = client.post(f"/api/projects/{project.id}/transitions/", payload, format="json")
        assert resp.status_code in (200, 201)
        project.refresh_from_db()
        assert project.lifecycle_stage == "pipeline_taskforce_review"

    def test_gate_transition_requires_dual_auth_via_api(self, auth_client):
        client, user = auth_client
        project = ProjectFactory(lifecycle_stage="preparation_identification")
        payload = {
            "to_stage": "trc_endorsed",
            "transition_date": "2026-07-01",
        }
        resp = client.post(f"/api/projects/{project.id}/transitions/", payload, format="json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestProjectDelete:

    def test_delete_removes_project_and_children(self, auth_client):
        client, user = auth_client
        project = ProjectFactory()
        from apps.project.models import Project, ProjectCountry
        assert ProjectCountry.objects.filter(project=project).exists()
        resp = client.delete(f"/api/projects/{project.pk}/")
        assert resp.status_code == 204
        assert not Project.objects.filter(pk=project.pk).exists()
        assert not ProjectCountry.objects.filter(project_id=project.pk).exists()

    def test_delete_removes_pad_file(self, auth_client, tmp_path, settings):
        from django.core.files.base import ContentFile
        settings.MEDIA_ROOT = str(tmp_path)
        client, user = auth_client
        project = ProjectFactory()
        project.pad_reference_file.save("pad/test.pdf", ContentFile(b"%PDF-1.4"), save=True)
        storage, name = project.pad_reference_file.storage, project.pad_reference_file.name
        assert storage.exists(name)
        resp = client.delete(f"/api/projects/{project.pk}/")
        assert resp.status_code == 204
        assert not storage.exists(name)

    def test_delete_unauthenticated_is_refused(self, client):
        project = ProjectFactory()
        resp = client.delete(f"/api/projects/{project.pk}/")
        assert resp.status_code in (401, 403)
        from apps.project.models import Project
        assert Project.objects.filter(pk=project.pk).exists()

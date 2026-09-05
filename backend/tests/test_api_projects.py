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
            "official_reference_number": "Test Project SF-1-REF",
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
            "official_reference_number": "Stage Test-REF",
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
            "official_reference_number": "Creator Test-REF",
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
            "sdg_ids": [sdg.number],
            "we_category": "WE002",
            "risk_rating": "tbd",
            "climate_marker": "tbd",
        }
        resp = client.patch(f"/api/projects/{project.id}/", payload, format="json")
        assert resp.status_code == 200
        assert resp.data["we_category_display"] == "WE002 — RWE"
        assert resp.data["climate_marker_display"] == "To be defined"
        project.refresh_from_db()
        assert project.we_category == "WE002"
        assert project.risk_rating == "tbd"
        assert list(project.sdgs.values_list("number", flat=True)) == [3]

    def test_patch_rejects_unknown_we_category(self, auth_client):
        client, user = auth_client
        project = ProjectFactory()
        resp = client.patch(f"/api/projects/{project.id}/", {"we_category": "1"}, format="json")
        assert resp.status_code == 400

    def test_patch_ignores_removed_classification_fields(self, auth_client):
        client, user = auth_client
        project = ProjectFactory()
        payload = {"gender_marker": "1", "fragility_status": "stable", "geographic_typology": "rural"}
        resp = client.patch(f"/api/projects/{project.id}/", payload, format="json")
        assert resp.status_code == 200
        for key in payload:
            assert key not in resp.data

    def test_patch_replaces_the_sdg_set(self, auth_client):
        """ADR 0006: one flat set, no primary; a PATCH replaces it wholesale."""
        client, user = auth_client
        from tests.factories import SdgFactory
        from apps.project.services import set_project_sdgs
        project = ProjectFactory()
        for n in (5, 6, 7):
            SdgFactory(number=n)
        set_project_sdgs(project, [5, 6])
        resp = client.patch(f"/api/projects/{project.id}/", {"sdg_ids": [6, 7]}, format="json")
        assert resp.status_code == 200
        assert sorted(project.sdgs.values_list("number", flat=True)) == [6, 7]
        assert sorted(s["number"] for s in resp.data["sdgs_detail"]) == [6, 7]


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

    def test_list_stage_entered_on_falls_back_to_created_at(self, auth_client):
        client, user = auth_client
        project = ProjectFactory(lifecycle_stage="concept_note")
        resp = client.get("/api/projects/")
        row = next(r for r in resp.data if r["id"] == project.id)
        assert row["stage_entered_on"] == project.created_at.date().isoformat()

    def test_list_stage_entered_on_uses_last_transition(self, auth_client):
        client, user = auth_client
        project = ProjectFactory(lifecycle_stage="concept_note")
        payload = {"to_stage": "pipeline_taskforce_review", "transition_date": "2026-07-01"}
        resp = client.post(f"/api/projects/{project.id}/transitions/", payload, format="json")
        assert resp.status_code in (200, 201)
        resp = client.get("/api/projects/")
        row = next(r for r in resp.data if r["id"] == project.id)
        assert row["lifecycle_stage"] == "pipeline_taskforce_review"
        assert row["stage_entered_on"] == "2026-07-01"


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

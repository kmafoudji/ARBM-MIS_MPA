"""
Tests SF-1 — Wizard d'enregistrement et enveloppe financière (SF-6).
"""
import pytest
from rest_framework.test import APIClient
from tests.factories import ProjectFactory, UserFactory, CountryFactory, SectorFactory, CurrencyFactory, ProjectFinancialEnvelopeFactory


@pytest.fixture
def auth_client():
    client = APIClient()
    user = UserFactory()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
class TestProjectCode:

    def test_code_generated_from_country_iso3(self, auth_client):
        client, user = auth_client
        country = CountryFactory(iso3="SEN")
        sector = SectorFactory()
        payload = {
            "name": "PAAFS",
            "official_reference_number": "PAAFS-REF",
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        resp = client.post("/api/projects/", payload, format="json")
        assert resp.status_code == 201
        from apps.project.models import Project
        project = Project.objects.get(pk=resp.data["id"])
        assert project.code.startswith("SEN-")

    def test_duplicate_name_allowed(self, auth_client):
        """Deux projets peuvent avoir le même nom (unicité sur la référence, pas le nom)."""
        client, user = auth_client
        country = CountryFactory()
        sector = SectorFactory()
        payload = {
            "name": "Same Name Project",
            "official_reference_number": "Same Name Project-REF",
            "country_ids": [country.id],
            "lead_country_id": country.id,
            "primary_sector": sector.id,
        }
        r1 = client.post("/api/projects/", payload, format="json")
        r2 = client.post("/api/projects/", {**payload, "official_reference_number": "REF-2"}, format="json")
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.data["id"] != r2.data["id"]


@pytest.mark.django_db
class TestFinancialEnvelope:

    def test_get_envelope_empty(self, auth_client):
        client, user = auth_client
        project = ProjectFactory()
        resp = client.get(f"/api/projects/{project.id}/envelope/")
        assert resp.status_code == 200
        assert float(resp.data["total_amount_usd"]) == 0.0

    def test_add_financing_source(self, auth_client):
        client, user = auth_client
        CurrencyFactory(code="USD")
        project = ProjectFactory()
        ProjectFinancialEnvelopeFactory(project=project)
        payload = {
            "source": "llf",
            "instrument": "grant",
            "amount": "5000000",
            "currency": "USD",
            "amount_usd": "5000000",
        }
        resp = client.post(f"/api/projects/{project.id}/envelope/sources/", payload, format="json")
        assert resp.status_code in (200, 201)

    def test_total_amount_reflects_sources(self, auth_client):
        client, user = auth_client
        CurrencyFactory(code="USD")
        project = ProjectFactory()
        ProjectFinancialEnvelopeFactory(project=project)
        for amount in ["3000000", "2000000"]:
            client.post(f"/api/projects/{project.id}/envelope/sources/", {
                "source": "llf", "instrument": "grant",
                "amount": amount, "currency": "USD", "amount_usd": amount,
            }, format="json")
        resp = client.get(f"/api/projects/{project.id}/envelope/")
        assert float(resp.data["total_amount_usd"]) == 5_000_000.0

    def test_delete_source(self, auth_client):
        client, user = auth_client
        CurrencyFactory(code="USD")
        project = ProjectFactory()
        ProjectFinancialEnvelopeFactory(project=project)
        add_resp = client.post(f"/api/projects/{project.id}/envelope/sources/", {
            "source": "llf", "instrument": "grant",
            "amount": "1000000", "currency": "USD", "amount_usd": "1000000",
        }, format="json")
        assert "id" in add_resp.data, f"Source non créée : {add_resp.data}"
        source_id = add_resp.data["id"]
        del_resp = client.delete(f"/api/projects/{project.id}/envelope/sources/{source_id}/")
        assert del_resp.status_code == 204
        env_resp = client.get(f"/api/projects/{project.id}/envelope/")
        assert float(env_resp.data["total_amount_usd"]) == 0.0


@pytest.mark.django_db
class TestPadUpload:

    def test_pad_upload_requires_pdf(self, auth_client):
        import io
        client, user = auth_client
        project = ProjectFactory()
        # Fichier non-PDF
        fake_file = io.BytesIO(b"not a pdf")
        fake_file.name = "document.txt"
        resp = client.post(
            f"/api/projects/{project.id}/pad/",
            {"file": fake_file},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_pad_upload_valid_pdf(self, auth_client):
        import io
        client, user = auth_client
        project = ProjectFactory()
        # Signature PDF minimale
        pdf_bytes = b"%PDF-1.4 fake content"
        fake_pdf = io.BytesIO(pdf_bytes)
        fake_pdf.name = "pad.pdf"
        resp = client.post(
            f"/api/projects/{project.id}/pad/",
            {"file": fake_pdf},
            format="multipart",
        )
        assert resp.status_code in (200, 201)

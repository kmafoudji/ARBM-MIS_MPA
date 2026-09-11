"""
Tests for the evidence endpoint of a results value (SF-10) and for who the
results workflow records.

The endpoint answered 500 on every call (a model used without being
imported), validated uploads with a library the image does not carry, and
looked for the acting user on an attribute AppUser does not have, so neither
the uploader, the verifier nor the workflow actors were ever stored.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.project.models import ReportingPeriod
from apps.results.models import Evidence, Indicator, LogframeRow, ResultsData
from tests.factories import ProjectFactory, SectorFactory, UserFactory

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.fixture
def results_value(db):
    project = ProjectFactory()
    indicator = Indicator.objects.create(
        code="EVD-IND-01",
        sector=SectorFactory(),
        name="Households reached",
        indicator_type="output",
        direction="increase",
        definition="A definition.",
        unit="Number",
    )
    row = LogframeRow.objects.create(project=project, indicator=indicator, chain_level="output")
    period = ReportingPeriod.objects.create(
        project=project, period_number=1,
        start_date=date(2026, 1, 1), end_date=date(2026, 3, 31), due_date=date(2026, 4, 30),
    )
    return ResultsData.objects.create(logframe_row=row, reporting_period=period, actual_value=Decimal("100"))


def evidence_url(rd):
    row = rd.logframe_row
    return f"/api/projects/{row.project_id}/logframe/{row.id}/results/{rd.id}/evidence/"


@pytest.mark.django_db
def test_listing_evidence_answers(client, results_value):
    response = client.get(evidence_url(results_value))
    assert response.status_code == 200, response.content
    assert response.data == {"count": 0, "results": []}


@pytest.mark.django_db
def test_an_external_link_is_saved_with_its_uploader(client, user, results_value):
    response = client.post(
        evidence_url(results_value),
        {"title": "Survey", "evidence_type": "survey", "external_url": "https://example.org/survey"},
        format="multipart",
    )
    assert response.status_code == 201, response.content
    evidence = Evidence.objects.get(pk=response.data["id"])
    assert evidence.uploaded_by == user


@pytest.mark.django_db
def test_an_image_is_accepted_by_its_content(client, results_value):
    upload = SimpleUploadedFile("photo.bin", PNG_BYTES, content_type="application/octet-stream")
    response = client.post(
        evidence_url(results_value),
        {"title": "Photo", "evidence_type": "photo", "file": upload},
        format="multipart",
    )
    assert response.status_code == 201, response.content


@pytest.mark.django_db
def test_a_file_that_is_not_a_pdf_or_an_image_is_refused(client, results_value):
    upload = SimpleUploadedFile("report.pdf", b"MZ\x90\x00not a pdf", content_type="application/pdf")
    response = client.post(
        evidence_url(results_value),
        {"title": "Fake", "evidence_type": "pdf", "file": upload},
        format="multipart",
    )
    assert response.status_code == 400
    assert not Evidence.objects.exists()


@pytest.mark.django_db
def test_verifying_evidence_records_the_verifier(client, user, results_value):
    evidence = Evidence.objects.create(results_data=results_value, title="Report")
    response = client.patch(
        f"{evidence_url(results_value)}{evidence.id}/", {"action": "verify"}, format="json",
    )
    assert response.status_code == 200, response.content
    evidence.refresh_from_db()
    assert evidence.status == "verified"
    assert evidence.verified_by == user


@pytest.mark.django_db
def test_submitting_a_value_records_who_submitted_it(client, user, results_value):
    row = results_value.logframe_row
    response = client.post(
        f"/api/projects/{row.project_id}/logframe/{row.id}/results/{results_value.id}/workflow/",
        {"action": "submit"}, format="json",
    )
    assert response.status_code == 200, response.content
    results_value.refresh_from_db()
    assert results_value.status == "submitted"
    assert results_value.submitted_by == user

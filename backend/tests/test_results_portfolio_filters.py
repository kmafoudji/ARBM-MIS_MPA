"""Tests API — filters of the portfolio results aggregation.

`?donor=` walked a relation that does not exist (`financial_envelope__sources`
instead of `financial_envelope__financing_sources`), so any request carrying
it raised a FieldError. These tests pin that the filter resolves and that it
keeps only the projects the donor actually finances.
"""
import pytest
from rest_framework.test import APIClient

from apps.project.models import FinancingSource, ProjectWorkspace
from apps.reference.models import Donor
from tests.factories import (
    CurrencyFactory,
    ProjectFactory,
    ProjectFinancialEnvelopeFactory,
    UserFactory,
)

URL = "/api/results/portfolio/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def active_project_funded_by(donor):
    """A project with a workspace (the view only counts those) and, when
    `donor` is given, one financing line from that donor."""
    project = ProjectFactory()
    ProjectWorkspace.objects.create(project=project)
    if donor:
        envelope = ProjectFinancialEnvelopeFactory(project=project)
        FinancingSource.objects.create(
            envelope=envelope, source="co_financing", instrument="grant", donor=donor,
            amount=1_000_000, currency=CurrencyFactory(), amount_usd=1_000_000,
        )
    return project


@pytest.mark.django_db
class TestDonorFilter:

    def test_donor_filter_does_not_raise(self, auth_client):
        donor = Donor.objects.create(code="qffd", name="Qatar Fund for Development")
        resp = auth_client.get(URL, {"donor": donor.pk})
        assert resp.status_code == 200

    def test_donor_filter_keeps_only_funded_projects(self, auth_client):
        donor = Donor.objects.create(code="qffd", name="Qatar Fund for Development")
        other = Donor.objects.create(code="adfd", name="Abu Dhabi Fund for Development")
        active_project_funded_by(donor)
        active_project_funded_by(other)
        active_project_funded_by(None)

        assert auth_client.get(URL).data["meta"]["projects_count"] == 3
        assert auth_client.get(URL, {"donor": donor.pk}).data["meta"]["projects_count"] == 1

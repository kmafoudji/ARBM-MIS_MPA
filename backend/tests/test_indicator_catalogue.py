"""
Tests API — Indicator catalogue (SF-1).

The PATCH endpoint filters the body against a hand-written allow-list, so a
field the form offers but the list omits is dropped with a 200 and no trace.
These tests pin the fields the catalogue sheet edits.
"""
import pytest
from rest_framework.test import APIClient

from apps.reference.models import Sdg
from apps.results.models import Indicator
from tests.factories import SdgFactory, SectorFactory, UserFactory


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


@pytest.fixture
def indicator():
    return Indicator.objects.create(
        code="TEST.1",
        sector=SectorFactory(),
        name="Test indicator",
        indicator_type="numeric",
        direction="increase",
        definition="A definition.",
        unit="Number",
    )


@pytest.mark.django_db
class TestIndicatorList:

    def test_list_carries_related_sdg_numbers(self, auth_client, indicator):
        indicator.related_sdgs.set([SdgFactory(number=2), SdgFactory(number=15)])
        resp = auth_client.get("/api/results/indicators/")
        assert resp.status_code == 200
        row = next(r for r in resp.data if r["code"] == "TEST.1")
        assert sorted(row["related_sdg_numbers"]) == [2, 15]


@pytest.mark.django_db
class TestIndicatorPatch:

    def test_patch_saves_chain_level_aggregation_and_tags(self, auth_client, indicator):
        resp = auth_client.patch(
            f"/api/results/indicators/{indicator.id}/",
            {
                "chain_level": "output",
                "aggregation_rule": "average",
                "cross_cutting_tags": ["gender", "climate"],
            },
            format="json",
        )
        assert resp.status_code == 200
        indicator.refresh_from_db()
        assert indicator.chain_level == "output"
        assert indicator.aggregation_rule == "average"
        assert indicator.cross_cutting_tags == ["gender", "climate"]

    def test_patch_replaces_the_sdg_set_and_answers_with_it(self, auth_client, indicator):
        SdgFactory(number=2)
        SdgFactory(number=5)
        SdgFactory(number=13)
        indicator.related_sdgs.set([Sdg.objects.get(number=2)])

        resp = auth_client.patch(
            f"/api/results/indicators/{indicator.id}/",
            {"related_sdg_numbers": [5, 13]},
            format="json",
        )
        assert resp.status_code == 200
        # The M2M is not refreshed by refresh_from_db(): the answer must already
        # carry the new set, or the sheet shows the old one right after saving.
        assert sorted(resp.data["related_sdg_numbers"]) == [5, 13]
        assert sorted(indicator.related_sdgs.values_list("number", flat=True)) == [5, 13]

    def test_patch_rejects_an_unknown_chain_level(self, auth_client, indicator):
        resp = auth_client.patch(
            f"/api/results/indicators/{indicator.id}/",
            {"chain_level": "not_a_level"},
            format="json",
        )
        assert resp.status_code == 400
        indicator.refresh_from_db()
        assert indicator.chain_level == ""

    def test_patch_rejects_an_unknown_cross_cutting_tag(self, auth_client, indicator):
        resp = auth_client.patch(
            f"/api/results/indicators/{indicator.id}/",
            {"cross_cutting_tags": ["gender", "not_a_tag"]},
            format="json",
        )
        assert resp.status_code == 400
        indicator.refresh_from_db()
        assert indicator.cross_cutting_tags == []

    def test_patch_rejects_an_unknown_sdg_number(self, auth_client, indicator):
        SdgFactory(number=2)
        resp = auth_client.patch(
            f"/api/results/indicators/{indicator.id}/",
            {"related_sdg_numbers": [2, 99]},
            format="json",
        )
        assert resp.status_code == 400
        assert indicator.related_sdgs.count() == 0

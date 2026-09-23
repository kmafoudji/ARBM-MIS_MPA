"""Tests API — the project type filter of the portfolio views (ADR 0014).

A view that spans projects shows one type at a time: `?type=llf` (the
default) or `?type=isdb`. The sector filter then speaks that type's taxonomy.
"""
import pytest
from rest_framework.test import APIClient

from apps.project.models import ProjectWorkspace
from apps.results.models import Indicator
from tests.factories import ProjectFactory, SectorFactory, UserFactory

EXECUTIVE = "/api/projects/executive-summary/"
PORTFOLIO = "/api/results/portfolio/"
FUND = "/api/results/fund-performance/"
DQ = "/api/results/dq-portfolio/"
MAP = "/api/projects/map/"
INDICATORS = "/api/results/indicators/"


@pytest.fixture
def auth_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


@pytest.fixture
def portfolio():
    """Two LLF projects (LLF1, LLF2) and one IsDB project under a pillar."""
    llf_health = SectorFactory(taxonomy="llf", name="LLF Health")
    llf_agri = SectorFactory(taxonomy="llf", name="LLF Agriculture")
    pillar = SectorFactory(taxonomy="isdb", name="Resilience")
    wash = SectorFactory(taxonomy="isdb", name="Water & Sanitation", parent=pillar)
    return {
        "llf_health": llf_health,
        "llf_agri": llf_agri,
        "pillar": pillar,
        "wash": wash,
        "llf1": ProjectFactory(investment_cycle="LLF1", primary_sector=llf_health),
        "llf2": ProjectFactory(investment_cycle="LLF2", primary_sector=llf_agri),
        "isdb": ProjectFactory(investment_cycle="IsDB", primary_sector=wash),
    }


@pytest.mark.django_db
class TestExecutiveSummary:

    def test_llf_is_the_default(self, auth_client, portfolio):
        data = auth_client.get(EXECUTIVE).data
        assert data["filters"]["type"] == "llf"
        assert data["headline"]["projects"] == 2
        assert {c["key"] for c in data["headline"]["projects_by_cycle"]} == {"LLF1", "LLF2"}

    def test_isdb_keeps_only_isdb_projects(self, auth_client, portfolio):
        data = auth_client.get(EXECUTIVE, {"type": "isdb"}).data
        assert data["headline"]["projects"] == 1
        assert [c["key"] for c in data["headline"]["projects_by_cycle"]] == ["IsDB"]
        assert [r["label"] for r in data["breakdowns"]["by_pillar"]] == ["Resilience"]
        assert data["results"]["group_level"] == "pillar"

    def test_llf_has_no_pillars(self, auth_client, portfolio):
        data = auth_client.get(EXECUTIVE).data
        assert data["breakdowns"]["by_pillar"] == []
        assert {r["label"] for r in data["breakdowns"]["by_sector"]} == {"LLF Health", "LLF Agriculture"}
        assert all(p["pillar"] is None for p in data["projects"])
        assert data["results"]["group_level"] == "sector"

    def test_sector_filter_within_the_type(self, auth_client, portfolio):
        data = auth_client.get(EXECUTIVE, {"sector": portfolio["llf_health"].pk}).data
        assert data["headline"]["projects"] == 1
        data = auth_client.get(EXECUTIVE, {"type": "isdb", "sector": portfolio["pillar"].pk}).data
        assert data["headline"]["projects"] == 1

    def test_a_cycle_of_the_other_type_is_refused(self, auth_client, portfolio):
        assert auth_client.get(EXECUTIVE, {"cycle": "IsDB"}).status_code == 400
        assert auth_client.get(EXECUTIVE, {"type": "isdb", "cycle": "LLF1"}).status_code == 400
        assert auth_client.get(EXECUTIVE, {"type": "isdb", "cycle": "IsDB"}).status_code == 200


@pytest.mark.django_db
class TestPortfolioViews:

    @pytest.mark.parametrize("url", [EXECUTIVE, PORTFOLIO, FUND, DQ, MAP])
    def test_unknown_type_is_refused(self, auth_client, url):
        assert auth_client.get(url, {"type": "other"}).status_code == 400

    def test_portfolio_aggregation_counts_one_type(self, auth_client, portfolio):
        for key in ("llf1", "llf2", "isdb"):
            ProjectWorkspace.objects.create(project=portfolio[key])
        assert auth_client.get(PORTFOLIO).data["meta"]["projects_count"] == 2
        assert auth_client.get(PORTFOLIO, {"type": "isdb"}).data["meta"]["projects_count"] == 1
        resp = auth_client.get(PORTFOLIO, {"type": "isdb", "sector": portfolio["pillar"].pk})
        assert resp.data["meta"]["projects_count"] == 1

    def test_fund_performance_counts_one_type(self, auth_client, portfolio):
        assert auth_client.get(FUND).data["summary"]["projects_in_scope"] == 2
        data = auth_client.get(FUND, {"type": "isdb"}).data
        assert data["summary"]["projects_in_scope"] == 1
        assert data["filters"]["type"] == "isdb"


@pytest.mark.django_db
class TestIndicatorCatalogue:
    """On this route `?type=` is the indicator type; the classification is `?taxonomy=`."""

    @pytest.fixture
    def indicators(self, portfolio):
        def make(code, sector, llf_sector=None):
            return Indicator.objects.create(
                code=code, sector=sector, llf_sector=llf_sector, name=code,
                direction="increase", definition="", unit="Number",
            )
        return {
            "both": make("BOTH.1", portfolio["wash"], portfolio["llf_health"]),
            "isdb_only": make("ISDB.1", portfolio["wash"]),
        }

    def codes(self, resp):
        assert resp.status_code == 200, resp.data
        return sorted(r["code"] for r in resp.data)

    def test_without_taxonomy_the_whole_catalogue(self, auth_client, indicators):
        assert self.codes(auth_client.get(INDICATORS)) == ["BOTH.1", "ISDB.1"]

    def test_llf_keeps_indicators_with_an_llf_sector(self, auth_client, indicators, portfolio):
        assert self.codes(auth_client.get(INDICATORS, {"taxonomy": "llf"})) == ["BOTH.1"]
        resp = auth_client.get(INDICATORS, {"taxonomy": "llf", "sector": portfolio["llf_health"].pk})
        assert self.codes(resp) == ["BOTH.1"]
        resp = auth_client.get(INDICATORS, {"taxonomy": "llf", "sector": portfolio["llf_agri"].pk})
        assert self.codes(resp) == []

    def test_isdb_filters_on_the_isdb_sector_and_pillar(self, auth_client, indicators, portfolio):
        assert self.codes(auth_client.get(INDICATORS, {"taxonomy": "isdb"})) == ["BOTH.1", "ISDB.1"]
        resp = auth_client.get(INDICATORS, {"taxonomy": "isdb", "sector": portfolio["pillar"].pk})
        assert self.codes(resp) == ["BOTH.1", "ISDB.1"]

    def test_rows_carry_both_sectors(self, auth_client, indicators):
        row = next(r for r in auth_client.get(INDICATORS).data if r["code"] == "BOTH.1")
        assert row["sector_name"] == "Water & Sanitation"
        assert row["llf_sector_name"] == "LLF Health"
        row = next(r for r in auth_client.get(INDICATORS).data if r["code"] == "ISDB.1")
        assert row["llf_sector"] is None and row["llf_sector_name"] is None

    def test_patch_sets_and_clears_the_llf_sector(self, auth_client, indicators, portfolio):
        url = f"{INDICATORS}{indicators['isdb_only'].pk}/"
        resp = auth_client.patch(url, {"llf_sector": portfolio["llf_agri"].pk}, format="json")
        assert resp.status_code == 200, resp.data
        assert resp.data["llf_sector_name"] == "LLF Agriculture"
        resp = auth_client.patch(url, {"llf_sector": None}, format="json")
        assert resp.status_code == 200
        assert resp.data["llf_sector"] is None

    @pytest.mark.parametrize("field, value_key", [
        ("llf_sector", "wash"),        # an IsDB sector as LLF sector
        ("sector", "llf_health"),      # an LLF sector as IsDB sector
        ("sector", "pillar"),          # a pillar
    ])
    def test_patch_refuses_a_sector_of_the_wrong_kind(
        self, auth_client, indicators, portfolio, field, value_key,
    ):
        url = f"{INDICATORS}{indicators['both'].pk}/"
        resp = auth_client.patch(url, {field: portfolio[value_key].pk}, format="json")
        assert resp.status_code == 400
        assert field in resp.data

    def test_patch_refuses_to_clear_the_isdb_sector(self, auth_client, indicators):
        url = f"{INDICATORS}{indicators['both'].pk}/"
        assert auth_client.patch(url, {"sector": None}, format="json").status_code == 400


@pytest.mark.django_db
def test_seed_indicators_gives_new_indicators_their_llf_sector():
    from django.core.management import call_command

    call_command("seed_reference_data")
    call_command("seed_indicators", "--sector", "health")
    health = Indicator.objects.filter(sector__code="HEALTH")
    assert health.exists()
    assert set(health.values_list("llf_sector__code", flat=True)) == {"LLF_HEALTH"}

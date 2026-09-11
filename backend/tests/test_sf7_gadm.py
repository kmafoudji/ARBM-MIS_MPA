"""
Tests SF-7 — Périmètre géographique GADM.
"""
import pytest
from rest_framework.test import APIClient
from tests.factories import ProjectFactory, UserFactory, CountryFactory


@pytest.fixture
def auth_client():
    client = APIClient()
    user = UserFactory()
    client.force_authenticate(user=user)
    return client, user


def make_gadm_area(country, level=1, name="Test Region", uid=None, parent=None):
    from apps.reference.models import GadmArea
    import random
    uid = uid or f"{country.iso3}.{random.randint(1,999)}_1"
    return GadmArea.objects.create(
        country=country, level=level, name=name, gadm_uid=uid, parent=parent
    )


@pytest.mark.django_db
class TestGadmScope:

    def test_add_admin1_to_scope(self, auth_client):
        client, user = auth_client
        country = CountryFactory()
        project = ProjectFactory()
        area = make_gadm_area(country, level=1, uid="TST.1_1")
        resp = client.post(
            f"/api/projects/{project.id}/gadm-scope/",
            {"area": area.id, "is_primary": True},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["area_name"] == "Test Region"
        assert resp.data["is_primary"] is True

    def test_add_admin2_to_scope(self, auth_client):
        client, user = auth_client
        country = CountryFactory()
        project = ProjectFactory()
        admin1 = make_gadm_area(country, level=1, uid="TST.2_1", name="Region A")
        admin2 = make_gadm_area(country, level=2, uid="TST.2.1_1", name="District X", parent=admin1)
        resp = client.post(
            f"/api/projects/{project.id}/gadm-scope/",
            {"area": admin2.id},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["area_level"] == 2
        assert resp.data["parent_name"] == "Region A"

    def test_duplicate_zone_rejected(self, auth_client):
        client, user = auth_client
        country = CountryFactory()
        project = ProjectFactory()
        area = make_gadm_area(country, uid="TST.3_1")
        client.post(f"/api/projects/{project.id}/gadm-scope/", {"area": area.id}, format="json")
        resp = client.post(f"/api/projects/{project.id}/gadm-scope/", {"area": area.id}, format="json")
        assert resp.status_code == 400

    def test_remove_zone_from_scope(self, auth_client):
        client, user = auth_client
        country = CountryFactory()
        project = ProjectFactory()
        area = make_gadm_area(country, uid="TST.4_1")
        client.post(f"/api/projects/{project.id}/gadm-scope/", {"area": area.id}, format="json")
        resp = client.delete(f"/api/projects/{project.id}/gadm-scope/{area.id}/")
        assert resp.status_code == 204
        # Vérifier suppression
        get_resp = client.get(f"/api/projects/{project.id}/gadm-scope/")
        assert all(s["area"] != area.id for s in get_resp.data)

    def test_patch_is_primary(self, auth_client):
        client, user = auth_client
        country = CountryFactory()
        project = ProjectFactory()
        area = make_gadm_area(country, uid="TST.5_1")
        client.post(f"/api/projects/{project.id}/gadm-scope/",
                   {"area": area.id, "is_primary": False}, format="json")
        resp = client.patch(
            f"/api/projects/{project.id}/gadm-scope/{area.id}/",
            {"is_primary": True}, format="json",
        )
        assert resp.status_code == 200
        assert resp.data["is_primary"] is True

    def test_gadm_area_list_by_country(self, auth_client):
        client, user = auth_client
        country = CountryFactory(iso3="XYZ")
        make_gadm_area(country, level=1, uid="XYZ.1_1", name="Region 1")
        make_gadm_area(country, level=1, uid="XYZ.2_1", name="Region 2")
        resp = client.get(f"/api/reference/gadm/?country=XYZ&level=1")
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_gadm_area_list_by_parent(self, auth_client):
        client, user = auth_client
        country = CountryFactory(iso3="ABC")
        parent = make_gadm_area(country, level=1, uid="ABC.1_1", name="Parent")
        make_gadm_area(country, level=2, uid="ABC.1.1_1", name="Child 1", parent=parent)
        make_gadm_area(country, level=2, uid="ABC.1.2_1", name="Child 2", parent=parent)
        resp = client.get(f"/api/reference/gadm/?parent={parent.id}&level=2")
        assert resp.status_code == 200
        assert len(resp.data) == 2


@pytest.mark.django_db
def test_map_point_carries_the_extent_of_the_intervention_area(auth_client):
    """The portfolio map frames a project on this bbox ("Zoom to area")."""
    from django.contrib.gis.geos import MultiPolygon, Polygon
    from apps.project.models import ProjectGadmScope

    client, _ = auth_client
    country = CountryFactory()
    project = ProjectFactory()
    area = make_gadm_area(country, uid="BBX.1_1")
    area.geometry = MultiPolygon(Polygon(((2, 9), (4, 9), (4, 11), (2, 11), (2, 9))), srid=4326)
    area.save()
    ProjectGadmScope.objects.create(project=project, area=area)

    resp = client.get("/api/projects/map/")
    assert resp.status_code == 200
    feature = next(f for f in resp.data["features"] if f["properties"]["id"] == project.id)
    assert feature["properties"]["bbox"] == [2, 9, 4, 11]
    lng, lat = feature["geometry"]["coordinates"]
    assert 2 <= lng <= 4 and 9 <= lat <= 11


@pytest.mark.django_db
def test_map_point_carries_physical_progress_and_indicator_performance(auth_client):
    """The two measures the portfolio map can colour by."""
    from datetime import date
    from decimal import Decimal
    from django.contrib.gis.geos import MultiPolygon, Polygon
    from apps.project.models import ProjectGadmScope, ReportingPeriod
    from apps.results.models import Indicator, LogframeRow, ResultsData
    from apps.workplan.models import Activity, WorkplanComponent, WorkplanSubComponent
    from tests.factories import SectorFactory

    client, _ = auth_client
    project = ProjectFactory()
    area = make_gadm_area(CountryFactory(), uid="PRF.1_1")
    area.geometry = MultiPolygon(Polygon(((2, 9), (4, 9), (4, 11), (2, 11), (2, 9))), srid=4326)
    area.save()
    ProjectGadmScope.objects.create(project=project, area=area)

    component = WorkplanComponent.objects.create(project=project, code="C1", name="Component")
    sub = WorkplanSubComponent.objects.create(component=component, code="C1.1", name="Sub")
    for code, progress in (("A1", 20), ("A2", 60)):
        Activity.objects.create(sub_component=sub, code=code, name=code, progress=progress,
                                planned_start=date(2026, 1, 1), planned_end=date(2026, 12, 31))

    indicator = Indicator.objects.create(code="PRF-IND-01", sector=SectorFactory(), name="Reached",
                                         indicator_type="output", direction="increase",
                                         definition="A definition.", unit="Number")
    row = LogframeRow.objects.create(project=project, indicator=indicator, chain_level="output")
    for n, (end, rate) in enumerate(((date(2026, 3, 31), "40"), (date(2026, 6, 30), "75")), start=1):
        period = ReportingPeriod.objects.create(project=project, period_number=n, start_date=date(2026, 1, 1),
                                                end_date=end, due_date=end)
        ResultsData.objects.create(logframe_row=row, reporting_period=period, actual_value=Decimal("1"),
                                   status="approved", achievement_rate=Decimal(rate))

    resp = client.get("/api/projects/map/")
    props = next(f["properties"] for f in resp.data["features"] if f["properties"]["id"] == project.id)
    assert props["physical_progress"] == 40.0
    assert props["indicator_performance"] == 75.0  # the latest value, not the mean of both
    assert props["indicator_rag"] == "amber"

from django.urls import path

from .views import (
    SpatialAssetDetailView,
    SpatialAssetDownloadView,
    SpatialAssetGeoJSONView,
    SpatialAssetView,
)

# Mounted under api/projects/<int:pk>/gis-assets/ from config/urls.py.
urlpatterns = [
    path("", SpatialAssetView.as_view(), name="gis-assets"),
    path("<int:asset_pk>/", SpatialAssetDetailView.as_view(), name="gis-asset-detail"),
    path("<int:asset_pk>/geojson/", SpatialAssetGeoJSONView.as_view(), name="gis-asset-geojson"),
    path("<int:asset_pk>/download/", SpatialAssetDownloadView.as_view(), name="gis-asset-download"),
]

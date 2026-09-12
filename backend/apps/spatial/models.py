"""
M5 — GIS assets registry.

A GIS asset is one geospatial file uploaded against a project (GeoJSON, KML,
KMZ, GPX, GeoPackage or a zipped shapefile). On upload the file is validated
and normalised to EPSG:4326 features stored in PostGIS; the original file is
kept for download and traceability.

The app is called `spatial`, not `gis`: `django.contrib.gis` already owns the
`gis` app label and Django refuses duplicate labels. The name also matches the
`spatial_source` / `site` entities the data-model diagnosis (P/S-09) expects to
land here later.

Scope of this first pass: assets are a visual overlay only. They do not feed
ProjectGadmScope nor the geometry derived from it, so /api/projects/<pk>/geojson/
and /api/projects/<pk>/map/ are untouched.

POL-1.07: soft-delete via is_active.
"""
from django.contrib.gis.db import models as gis_models
from django.db import models

from apps.identity.models import AppUser
from apps.project.models import Project

SOURCE_FORMAT_CHOICES = [
    ("geojson", "GeoJSON"),
    ("kml",     "KML"),
    ("kmz",     "KMZ"),
    ("gpx",     "GPX"),
    ("gpkg",    "GeoPackage"),
    ("shp_zip", "Shapefile (ZIP)"),
]

ASSET_STATUS_CHOICES = [
    ("ready",  "Ready"),
    ("failed", "Failed"),
]

# Default overlay colour. Terracotta, deliberately outside the lime/navy pair
# used by the GADM layers so an uploaded layer never reads as project scope.
DEFAULT_LAYER_COLOR = "#E2725B"


def gis_asset_upload_path(instance, filename):
    """Storage path: gis/<project reference>/<generated filename>."""
    project = instance.project
    reference = project.official_reference_number or project.pk
    return f"gis/{reference}/{filename}"


class SpatialAsset(models.Model):
    """
    One uploaded geospatial file, normalised into EPSG:4326 features.

    `status` and `error_detail` exist from the start even though conversion is
    synchronous today: moving the pipeline to Celery later will not need a
    migration.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE,
        related_name="spatial_assets",
    )
    name        = models.CharField(max_length=160)
    description = models.TextField(blank=True)

    source_format = models.CharField(
        max_length=10, choices=SOURCE_FORMAT_CHOICES,
    )
    original_file = models.FileField(
        upload_to=gis_asset_upload_path,
        null=True, blank=True,
        help_text="The file as uploaded. Served only through the download "
                  "endpoint, never as a direct storage URL.",
    )
    original_filename   = models.CharField(max_length=255)
    original_size_bytes = models.PositiveIntegerField(default=0)
    checksum_sha256     = models.CharField(
        max_length=64, blank=True,
        help_text="Of the original file, for traceability.",
    )

    feature_count  = models.PositiveIntegerField(default=0)
    geometry_types = models.JSONField(
        default=list, blank=True,
        help_text='Distinct geometry types found, e.g. ["Point", "Polygon"].',
    )
    # Stored as four columns rather than a PolygonField: a single-point asset
    # would otherwise produce a degenerate polygon.
    bbox_min_x = models.FloatField(null=True, blank=True)
    bbox_min_y = models.FloatField(null=True, blank=True)
    bbox_max_x = models.FloatField(null=True, blank=True)
    bbox_max_y = models.FloatField(null=True, blank=True)

    layer_color = models.CharField(
        max_length=7, default=DEFAULT_LAYER_COLOR,
        help_text="Hex colour used to draw the layer on the project map.",
    )
    is_visible_default = models.BooleanField(
        default=True,
        help_text="Whether the layer is drawn when the map first opens.",
    )

    status       = models.CharField(
        max_length=10, choices=ASSET_STATUS_CHOICES, default="ready",
    )
    error_detail = models.TextField(blank=True)

    uploaded_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="spatial_assets_uploaded",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table = "gis_asset"
        ordering = ["-uploaded_at"]
        verbose_name = "GIS asset"
        indexes = [
            models.Index(fields=["project", "is_active"], name="gis_asset_project_idx"),
        ]

    def __str__(self):
        return f"{self.name} [{self.get_source_format_display()}]"

    @property
    def bbox(self):
        """[min_x, min_y, max_x, max_y], or None when the asset has no extent."""
        corners = (self.bbox_min_x, self.bbox_min_y, self.bbox_max_x, self.bbox_max_y)
        if any(c is None for c in corners):
            return None
        return list(corners)


class SpatialAssetFeature(models.Model):
    """
    One feature of an asset.

    The geometry column is deliberately untyped: a single upload may carry
    points, lines and polygons at once (a KMZ with placemarks and tracks is the
    common case), and splitting them into three tables would buy nothing.
    """
    asset = models.ForeignKey(
        SpatialAsset, on_delete=models.CASCADE,
        related_name="features",
    )
    # spatial_index=True is the GeometryField default: PostGIS gets its GiST
    # index without an explicit Meta.indexes entry.
    geometry   = gis_models.GeometryField(srid=4326)
    properties = models.JSONField(default=dict, blank=True)
    label      = models.CharField(
        max_length=255, blank=True,
        help_text="Best-effort display name read from the source attributes.",
    )

    class Meta:
        db_table = "gis_asset_feature"
        indexes = [
            models.Index(fields=["asset"], name="gis_feature_asset_idx"),
        ]

    def __str__(self):
        return self.label or f"Feature {self.pk}"

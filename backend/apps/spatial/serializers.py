import re

from rest_framework import serializers

from .models import SpatialAsset

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class SpatialAssetSerializer(serializers.ModelSerializer):
    """
    Asset metadata. Never carries geometry: the features are fetched separately
    from the geojson endpoint, so a project with twenty layers still lists fast.
    """
    source_format_display = serializers.CharField(
        source="get_source_format_display", read_only=True,
    )
    uploaded_by_name = serializers.SerializerMethodField()
    bbox             = serializers.SerializerMethodField()
    download_url     = serializers.SerializerMethodField()
    geojson_url      = serializers.SerializerMethodField()

    class Meta:
        model  = SpatialAsset
        fields = [
            "id", "project", "name", "description",
            "source_format", "source_format_display",
            "original_filename", "original_size_bytes", "checksum_sha256",
            "feature_count", "geometry_types", "bbox",
            "layer_color", "is_visible_default",
            "status", "error_detail",
            "uploaded_by", "uploaded_by_name", "uploaded_at",
            "download_url", "geojson_url",
        ]
        read_only_fields = [
            "id", "project", "source_format", "original_filename",
            "original_size_bytes", "checksum_sha256", "feature_count",
            "geometry_types", "status", "error_detail",
            "uploaded_by", "uploaded_at",
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None

    def get_bbox(self, obj):
        return obj.bbox

    def get_download_url(self, obj):
        # The original is never exposed as a storage URL — see converters.py.
        if not obj.original_file:
            return None
        return f"/api/projects/{obj.project_id}/gis-assets/{obj.pk}/download/"

    def get_geojson_url(self, obj):
        return f"/api/projects/{obj.project_id}/gis-assets/{obj.pk}/geojson/"


class SpatialAssetUpdateSerializer(serializers.ModelSerializer):
    """The handful of fields a user may change after upload."""

    class Meta:
        model  = SpatialAsset
        fields = ["name", "description", "layer_color", "is_visible_default"]

    def validate_layer_color(self, value):
        # The value reaches a MapLibre paint property, so it is constrained to
        # a plain hex triplet rather than trusted as free text.
        if not HEX_COLOR.match(value or ""):
            raise serializers.ValidationError(
                "Expected a hex colour such as #E2725B."
            )
        return value

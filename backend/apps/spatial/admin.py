from django.contrib import admin

from .models import SpatialAsset


@admin.register(SpatialAsset)
class SpatialAssetAdmin(admin.ModelAdmin):
    list_display  = ("name", "project", "source_format", "feature_count",
                     "uploaded_at", "is_active")
    list_filter   = ("source_format", "status", "is_active")
    search_fields = ("name", "original_filename")
    readonly_fields = ("checksum_sha256", "feature_count", "geometry_types",
                       "uploaded_at")

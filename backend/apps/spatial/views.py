"""
M5 — GIS assets registry endpoints.

All of them sit under /api/projects/<pk>/, so they carry the same permission
triple as ProjectPadView: the module permission for writes, and ProjectInScope
for row-level visibility (an out-of-scope project answers 404).

Module code: m1_config_access, like every other project-nested endpoint. The
RBAC enum still calls M5 "Validation" and puts cartography on m7_gis, which
contradicts the product's own numbering (M5 = GIS & Spatial); reconciling the
enum is a decision of its own and is not deepened here.
"""
import json
from pathlib import Path
from uuid import uuid4

from django.contrib.gis.geos import GEOSGeometry
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from apps.project.models import Project
from core.scope import ProjectInScope

from .converters import ConversionError, convert
from .models import SpatialAsset, SpatialAssetFeature
from .serializers import SpatialAssetSerializer, SpatialAssetUpdateSerializer

# Beyond this the map stops being readable and the list stops being useful.
MAX_ASSETS_PER_PROJECT = 20


class SpatialAssetView(APIView):
    """
    GET  /api/projects/<pk>/gis-assets/   — active assets, metadata only
    POST /api/projects/<pk>/gis-assets/   — multipart: `file`, optional `name`
                                            and `description`
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"
    parser_classes     = [MultiPartParser, FormParser]

    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        assets = (
            SpatialAsset.objects
            .filter(project=project, is_active=True)
            .select_related("uploaded_by")
        )
        return Response({
            "count":   assets.count(),
            "results": SpatialAssetSerializer(assets, many=True).data,
        })

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)

        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "No file received (expected field: `file`)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active = SpatialAsset.objects.filter(project=project, is_active=True).count()
        if active >= MAX_ASSETS_PER_PROJECT:
            return Response(
                {"detail": f"This project already has {MAX_ASSETS_PER_PROJECT} layers, "
                           "the maximum. Remove one before adding another."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            converted = convert(upload)
        except ConversionError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        # Build the geometries before touching the database: a geometry GDAL
        # emits but GEOS refuses must not leave a half-written asset behind.
        geometries = []
        for item in converted["features"]:
            try:
                geometry = GEOSGeometry(json.dumps(item["geometry"]), srid=4326)
            except Exception:
                continue
            geometries.append((geometry, item["properties"], item["label"]))

        if not geometries:
            return Response(
                {"detail": "The file contains no geometry this system can store."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = (request.data.get("name") or "").strip()[:160]
        if not name:
            name = Path(upload.name).stem[:160] or "Unnamed layer"

        # convert() consumed the upload through chunks(); rewind before storing.
        upload.seek(0)

        with transaction.atomic():
            asset = SpatialAsset(
                project             = project,
                name                = name,
                description         = (request.data.get("description") or "").strip(),
                source_format       = converted["source_format"],
                original_filename   = Path(upload.name).name[:255],
                original_size_bytes = converted["size"],
                checksum_sha256     = converted["checksum_sha256"],
                geometry_types      = converted["geometry_types"],
                feature_count       = len(geometries),
                uploaded_by         = request.user,
            )

            # Generated storage name: no client path, no collision, and the
            # original extension is re-derived from the detected format.
            stem = Path(upload.name).stem[:60]
            safe_stem = "".join(
                ch if ch.isalnum() or ch in "-_" else "-" for ch in stem
            ).strip("-")
            suffix = Path(upload.name).suffix[:12].lower()
            safe_suffix = "".join(
                ch for ch in suffix if ch.isalnum() or ch == "."
            ) or ".dat"
            asset.original_file.save(
                f"{safe_stem or 'layer'}-{uuid4().hex[:8]}{safe_suffix}",
                upload, save=False,
            )
            asset.save()

            SpatialAssetFeature.objects.bulk_create(
                [
                    SpatialAssetFeature(
                        asset      = asset,
                        geometry   = geometry,
                        properties = properties,
                        label      = label,
                    )
                    for geometry, properties, label in geometries
                ],
                batch_size=1000,
            )
            _set_bbox(asset)
            asset.save(update_fields=[
                "bbox_min_x", "bbox_min_y", "bbox_max_x", "bbox_max_y",
            ])

        return Response(SpatialAssetSerializer(asset).data, status=status.HTTP_201_CREATED)


class SpatialAssetDetailView(APIView):
    """
    PATCH  /api/projects/<pk>/gis-assets/<asset_pk>/ — name, description,
                                                      colour, default visibility
    DELETE /api/projects/<pk>/gis-assets/<asset_pk>/ — soft delete (POL-1.07)
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def patch(self, request, pk, asset_pk):
        asset = _get_asset(pk, asset_pk)
        serializer = SpatialAssetUpdateSerializer(asset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SpatialAssetSerializer(asset).data)

    def delete(self, request, pk, asset_pk):
        asset = _get_asset(pk, asset_pk)
        asset.is_active = False
        asset.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SpatialAssetGeoJSONView(APIView):
    """
    GET /api/projects/<pk>/gis-assets/<asset_pk>/geojson/

    Same shape and same technique as ProjectGeoJSONView: ST_AsGeoJSON in the
    database, the FeatureCollection assembled in Python.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk, asset_pk):
        asset = _get_asset(pk, asset_pk)

        with connection.cursor() as cur:
            cur.execute("""
                SELECT id, label, properties, ST_AsGeoJSON(geometry)::json
                FROM gis_asset_feature
                WHERE asset_id = %s
                ORDER BY id
            """, [asset.pk])
            rows = cur.fetchall()

        features = []
        for feature_id, label, properties, geometry in rows:
            if geometry is None:
                continue
            # Read through a cursor rather than the ORM, so the JSONField is
            # not decoded for us: jsonb comes back as text here.
            if isinstance(properties, str):
                try:
                    properties = json.loads(properties)
                except ValueError:
                    properties = {}
            if not isinstance(properties, dict):
                properties = {}
            features.append({
                "type":     "Feature",
                "geometry": geometry,
                "properties": {
                    **properties,
                    "_id":    feature_id,
                    "_label": label,
                    "_asset": asset.pk,
                },
            })

        return Response({
            "type":     "FeatureCollection",
            "features": features,
        })


class SpatialAssetDownloadView(APIView):
    """
    GET /api/projects/<pk>/gis-assets/<asset_pk>/download/

    The original file, always as an attachment.

    KML and GPX are XML and KMZ is a ZIP: core/uploads.py sets out why an XML
    document must not be served from the origin that carries the session
    cookie. Handing back default_storage.url() — what the PAD and Evidence
    endpoints do today — would do exactly that in development, where /media is
    proxied to Django on the frontend origin. Streaming it here, as an
    octet-stream attachment with nosniff, keeps the browser from ever rendering
    it and keeps the file behind ProjectInScope.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk, asset_pk):
        asset = _get_asset(pk, asset_pk)
        if not asset.original_file:
            return Response(
                {"detail": "This layer has no stored original file."},
                status=status.HTTP_404_NOT_FOUND,
            )

        handle = default_storage.open(asset.original_file.name, "rb")
        response = FileResponse(
            handle,
            as_attachment=True,
            filename=asset.original_filename or "layer.dat",
            content_type="application/octet-stream",
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_asset(project_pk, asset_pk):
    return get_object_or_404(
        SpatialAsset, pk=asset_pk, project_id=project_pk, is_active=True,
    )


def _set_bbox(asset):
    """Read the extent back from PostGIS and store it on the asset."""
    with connection.cursor() as cur:
        cur.execute("""
            SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e)
            FROM (SELECT ST_Extent(geometry) AS e
                  FROM gis_asset_feature WHERE asset_id = %s) AS extent
        """, [asset.pk])
        row = cur.fetchone()

    if row and row[0] is not None:
        asset.bbox_min_x, asset.bbox_min_y, asset.bbox_max_x, asset.bbox_max_y = row

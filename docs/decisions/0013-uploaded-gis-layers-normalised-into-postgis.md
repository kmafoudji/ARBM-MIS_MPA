# 0013 — Uploaded GIS layers are normalised into PostGIS and served as GeoJSON behind the API

## Context

Module 5 knew only derived geography: a project's area came from picking GADM
Admin 1/2 rows out of a catalogue loaded by a management command, and the map
drew their union. Nothing let a user bring geography of their own — no upload
accepted a shapefile, GeoJSON, KML or GPX, no endpoint took geometry in, and a
project had no way to record an intervention point. The data-model diagnosis
records the gap as P/S-09 and expects a `spatial_layer` / `spatial_source` /
`site` family to fill it.

Serving such layers through Martin was the obvious route, since Martin already
serves the basemap (0009). It is the wrong one: Martin publishes whole tables
with no row filter, and `/martin` carries no authentication. One
`gis_asset_feature` table behind it would hand every project's uploaded
geometry to anyone who reached the URL.

## Decision

- An uploaded file becomes a `SpatialAsset` and its `SpatialAssetFeature` rows,
  normalised to EPSG:4326 in PostGIS. The features are served by
  `/api/projects/<pk>/gis-assets/<id>/geojson/`, behind `ProjectInScope`, in the
  shape and by the technique `ProjectGeoJSONView` already uses: `ST_AsGeoJSON`
  in the database, the FeatureCollection assembled in Python. **Martin serves
  the basemap; per-project overlays come from the API.**
- Accepted: GeoJSON, KML, KMZ, GPX, GeoPackage and zipped shapefile. Conversion
  runs through `ogr2ogr`, already in the backend image, so no dependency is
  added. The format is decided by the file's content — never by its extension,
  the same rule the logo and evidence uploads follow.
- The layers are a **visual overlay**. They do not feed `ProjectGadmScope` nor
  the geometry derived from it; SF-7 remains the project's geographic scope.
- The original file is kept and can be downloaded, but **only as an attachment
  from an authenticated endpoint**, never as a storage URL. KML and GPX are XML
  and KMZ is a ZIP: `core/uploads.py` sets out why an XML document served from
  the origin that carries the session cookie is a session-theft risk, and
  handing back `default_storage.url()` — what the PAD and evidence endpoints do
  — would do exactly that wherever media is proxied onto the app's origin.
- Ceilings are fixed rather than assumed: 10 MB per file, 20 000 features and
  20 layers per asset, 20 active assets per project, 64 MB of converted output,
  and a 20-second conversion timeout so the work fits inside gunicorn's.
  Archives are validated through their central directory — no absolute paths, no
  traversal, bounded entry count and uncompressed size — and then read in place
  as `/vsizip/`, never extracted.
- The Django app is `apps.spatial`, not `apps.gis`: `django.contrib.gis` owns
  the `gis` label. Its endpoints declare `m1_config_access`, like every other
  project-nested endpoint.

## Consequences

- Large layers are out of scope by construction. Serving them would mean vector
  tiles, which means either public geometry or a Martin function source that can
  filter on a project — a decision of its own, not taken here.
- Deleting a project now removes its GIS files from storage as well as its PAD;
  `FileField`s are still not covered by the cascade.
- The download endpoint is stricter than the PAD and evidence endpoints, which
  still expose `file.url`. Aligning them is a separate change.
- `Permission.MODULE_CHOICES` still calls M5 "Validation" and puts cartography
  on `m7_gis`, contradicting the product's numbering (M5 = GIS & Spatial, as
  `ProjectWorkspace.m5_gis_ready` and the project tabs have it). This decision
  does not deepen the conflict and does not resolve it.
- `ProjectWorkspace.m5_gis_ready` stays a boolean where the reference model
  expects the four states GIS001–GIS004.

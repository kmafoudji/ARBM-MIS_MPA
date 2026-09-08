# 0009 — The basemap is Natural Earth in PostGIS, served by Martin from an explicit source list

## Context

The maps drew their background from two Natural Earth 110m GeoJSON files
fetched from GitHub on every load, unpinned, with no lakes or places and a
resolution that turned coastlines into polygons from zoom 4. Martin served
only the GADM table and, running without a config file, published every
geometry table in the database, including the TIGER geocoder tables that
ship with the PostGIS image. The two map components each carried their own
copy of the style, and the copies had drifted.

## Decision

- Natural Earth (countries at 1:50m and 1:10m, populated places, lakes) is
  loaded into PostGIS by `import_natural_earth`, pinned to one Natural Earth
  release tag, and is part of the seed order in `docs/fresh-environment.md`.
  The tables are managed Django models in `apps.reference` so that they exist
  from an empty database (0005).
- Martin runs with `infra/martin/config.yaml` and `auto_publish` off. A table
  is served only if it is listed there, with its zoom range and properties.
  The image tag is pinned.
- Each resolution is a separate Martin source (a view per scale, plus a view
  of label points), because Martin publishes whole tables and cannot filter
  rows per zoom.
- One style module, `frontend/src/components/mapStyle.js`, is the basemap for
  every map. Its look is a reduced CARTO Positron: neutral light greys so the
  project overlays and sector colours stay the loudest thing on the map.
  Country fills switch from 50m to 10m at zoom 5; cities appear in zoom bands
  driven by Natural Earth's `min_zoom`.

## Consequences

- No map request leaves the stack except the glyphs
  (`fonts.openmaptiles.org`); self-hosting them is a separate change.
- A new tile source is a model or view, a config entry and a style layer,
  each reviewable on its own.
- The Natural Earth tables are basemap only. They are not the portfolio
  country list and must not become a fourth copy of it.
- Upgrading Natural Earth is a change of `NE_TAG` and a re-run; rows are
  upserted on stable Natural Earth ids.

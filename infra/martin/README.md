# Martin — tile server

Martin turns PostGIS tables into vector tiles (`/{source}/{z}/{x}/{y}`,
Mapbox Vector Tile format) that MapLibre draws in the browser. It reads
`config.yaml` in this directory, mounted by `docker-compose.yml`, and
publishes **only** the sources listed there (`auto_publish` is off so the
PostGIS image's TIGER tables stay out of the catalog). See decision 0009.

## Sources

| Source | Table / view | Zoom | Seeded by |
|---|---|---|---|
| `gadm_area` | `gadm_area` | 2-12 | `import_gadm --geom` |
| `ne_country_50m` | view on `ne_country` (scale 50) | 0-5 | `import_natural_earth` |
| `ne_country_10m` | view on `ne_country` (scale 10) | 4-10 | `import_natural_earth` |
| `ne_country_label` | view on `ne_country` (one label point per country) | 1-10 | `import_natural_earth` |
| `ne_place` | `ne_place` | 2-12 | `import_natural_earth` |
| `ne_lake` | `ne_lake` | 3-12 | `import_natural_earth` |

The layer name inside a tile (`source-layer` in MapLibre) is the source id.

## Checking

Martin has no public port in development; the Vite dev server proxies
`/martin`. From the frontend container:

```bash
curl -s http://martin:3000/catalog | jq .tiles     # the six sources above
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' http://martin:3000/ne_country_50m/2/2/1
```

or from the browser, `https://<host>/martin/catalog`.

## Adding a source

1. A model (or a view in a migration) with a geometry column, SRID 4326.
2. An entry in `config.yaml`: schema, table, `geometry_column`,
   `geometry_type`, `minzoom`/`maxzoom`, the `properties` the style needs.
   Views need explicit `bounds` (no statistics for `ST_EstimatedExtent`).
3. `docker compose up -d martin` — Martin does not reload the config.
4. A source and layers in `frontend/src/components/mapStyle.js`.

`${DATABASE_URL}` in the config must stay **unquoted**: Martin expands
environment variables only in that form.

## Production

In production the `/martin` route must reach the Martin container (the Vite
proxy does not exist in a static build); the ingress decision is open in
`docs/decisions/README.md`. Static PMTiles can be generated with
`martin-cp` if the database is not reachable from the tile server.

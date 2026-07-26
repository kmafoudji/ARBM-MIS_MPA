# Martin — Tile Server ARBM-MIS

## Démarrage

```bash
# Depuis le dossier infra/
docker compose up -d martin

# Vérifier que Martin tourne
curl http://localhost:3000/health

# Catalogue des sources
curl http://localhost:3000/catalog
```

## Couches disponibles

| Layer | URL | Zoom | Description |
|---|---|---|---|
| gadm_admin1 | `/gadm_admin1/{z}/{x}/{y}` | 2-14 | Régions Admin 1 (29 pays LLF2) |
| gadm_admin2 | `/gadm_admin2/{z}/{x}/{y}` | 5-14 | Districts Admin 2 |
| project_scope | `/project_scope/{z}/{x}/{y}` | 4-14 | Zones d'intervention projets |

## Intégration MapLibre

```javascript
map.addSource("gadm-admin1", {
  type: "vector",
  tiles: ["http://localhost:3000/gadm_admin1/{z}/{x}/{y}"],
  minzoom: 2,
  maxzoom: 14,
});
map.addLayer({
  id: "admin1-fill",
  type: "fill",
  source: "gadm-admin1",
  "source-layer": "gadm_admin1",
  paint: { "fill-color": "#A4C53F", "fill-opacity": 0.3 },
});
```

## Production

En production (Azure Container Apps), remplacer `localhost:3000`
par l'URL du service Martin déployé.
Les PMTiles peuvent être générés via :
```bash
docker compose exec martin martin-cp \
  postgresql://... \
  gadm_admin1 \
  --output gadm_admin1.pmtiles
```

/**
 * ProjectMap — Carte géographique projet
 * Fond de carte partagé : mapStyle.js (tuiles Martin, Positron réduit).
 * Source : /api/projects/<pk>/geojson/ → PostGIS GADM
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { ATTRIBUTION, BASEMAP_STYLE, LABELS_LAYER_ID } from "./mapStyle.js";
import { colorExpression, layerColor, layerNames } from "./layerColors.js";

// Les libellés des couches GIS viennent de fichiers téléversés : contenu non
// fiable, injecté ici dans du HTML de popup. On l'échappe.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function getBbox(features) {
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  features.forEach(f => {
    function walk(c) {
      if (typeof c[0] === "number") {
        minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
        minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
      } else c.forEach(walk);
    }
    if (f.geometry?.coordinates) walk(f.geometry.coordinates);
  });
  return [[minLng - 2, minLat - 2], [maxLng + 2, maxLat + 2]];
}

export default function ProjectMap({ projectId, countries = [] }) {
  const mapRef  = useRef(null);
  const mapInst = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const { data: geojson, isLoading } = useQuery({
    queryKey: ["project-geojson", projectId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/geojson/`),
    enabled:  !!projectId,
    staleTime: 5 * 60_000,
  });

  // Couches GIS téléversées (M5). La carte va les chercher elle-même : elles
  // apparaissent ainsi partout où ProjectMap est monté, sans que l'appelant
  // ait à les passer.
  const { data: assetList } = useQuery({
    queryKey: ["gis-assets", projectId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/gis-assets/`),
    enabled:  !!projectId,
    staleTime: 60_000,
  });

  const visibleAssets = (assetList?.results || []).filter(a => a.is_visible_default);

  const assetGeojson = useQueries({
    queries: visibleAssets.map(a => ({
      queryKey: ["gis-asset-geojson", a.id],
      queryFn:  () => apiFetch(`/api/projects/${projectId}/gis-assets/${a.id}/geojson/`),
      staleTime: 5 * 60_000,
    })),
  });

  const assetLayers = visibleAssets
    .map((asset, i) => ({ asset, geojson: assetGeojson[i]?.data }))
    .filter(l => l.geojson?.features?.length);

  // Les tableaux ci-dessus changent d'identité à chaque rendu : l'effet est
  // piloté par une signature stable, et lit les données via la ref.
  const assetLayersRef = useRef([]);
  assetLayersRef.current = assetLayers;
  const assetSignature = assetLayers
    .map(l => `${l.asset.id}:${l.asset.layer_color}:${l.geojson.features.length}`)
    .join("|");

  // Init carte avec style custom
  useEffect(() => {
    if (!mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: BASEMAP_STYLE,
      center: [20, 10],
      zoom: 2.5,
      attributionControl: false,
    });
    mapInst.current = map;
    // Contrôles
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-left");
    // Attendre que le style ET les sources soient chargés
    map.on("load", () => {
      // Vérifier que le style est complètement prêt
      if (map.isStyleLoaded()) {
        setMapReady(true);
      } else {
        map.once("idle", () => setMapReady(true));
      }
    });
    // Gérer la perte/restauration du contexte WebGL
    map.on("webglcontextlost", () => setMapReady(false));
    map.on("webglcontextrestored", () => map.once("idle", () => setMapReady(true)));
    return () => { map.remove(); mapInst.current = null; setMapReady(false); };
  }, []);

  // Couches projet
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !geojson?.features?.length) return;
    if (!map.isStyleLoaded()) return;

    const features   = geojson.features;
    const countries0 = features.filter(f => f.properties.level === 0);
    const admin1     = features.filter(f => f.properties.level === 1);
    const admin2     = features.filter(f => f.properties.level === 2);

    // Nettoyer
    ["proj-country-fill","proj-country-border",
     "proj-admin1-fill","proj-admin1-line",
     "proj-admin1-active-fill","proj-admin1-active-line",
     "proj-admin2-fill","proj-admin2-line",
     "proj-martin-admin1-fill","proj-martin-admin1-line"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["proj-country","proj-admin1","proj-admin1-active","proj-admin2"].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });

    // Pays du projet — lime 70%
    if (countries0.length) {
      map.addSource("proj-country", { type: "geojson", data: { type: "FeatureCollection", features: countries0 } });
      map.addLayer({ id: "proj-country-fill", type: "fill", source: "proj-country",
        paint: { "fill-color": "#0EB584", "fill-opacity": 0.18 } }, LABELS_LAYER_ID);
      map.addLayer({ id: "proj-country-border", type: "line", source: "proj-country",
        paint: { "line-color": "#09815F", "line-width": 2, "line-opacity": 0.9 } }, LABELS_LAYER_ID);
    }

    // Admin 1 depuis Martin — filtré sur les pays du projet
    const projectCountryIds = features
      .filter(f => f.properties.level === 0)
      .map(f => f.properties.iso2)
      .filter(Boolean);

    // Admin 1 — bordures selon présence d'Admin 2 sélectionnés
    if (admin1.length) {
      const admin2InScope = admin2.filter(f => f.properties.in_scope);
      // Utiliser parent_id (fiable) pour trouver les Admin 1 parents
      const parentIds = new Set(admin2InScope.map(f => f.properties.parent_id).filter(Boolean));

      const admin1WithChildren = admin1.filter(f => parentIds.has(f.properties.id));

      // Tous les Admin 1 — fond tirets gris léger
      map.addSource("proj-admin1", { type: "geojson", data: { type: "FeatureCollection", features: admin1 } });
      map.addLayer({ id: "proj-admin1-fill", type: "fill", source: "proj-admin1",
        paint: { "fill-color": "#0EB584", "fill-opacity": 0.08 } }, LABELS_LAYER_ID);
      map.addLayer({ id: "proj-admin1-line", type: "line", source: "proj-admin1",
        paint: { "line-color": "#09815F", "line-width": 0.6, "line-dasharray": [4, 3], "line-opacity": 0.4 } }, LABELS_LAYER_ID);

    }

    // Admin 2 scope — navy
    if (admin2.length) {
      map.addSource("proj-admin2", { type: "geojson", data: { type: "FeatureCollection", features: admin2 } });
      map.addLayer({ id: "proj-admin2-fill", type: "fill", source: "proj-admin2",
        paint: { "fill-color": "#0089C5", "fill-opacity": 0.40 } }, LABELS_LAYER_ID);
      map.addLayer({ id: "proj-admin2-line", type: "line", source: "proj-admin2",
        paint: { "line-color": "#0089C5", "line-width": 1.5, "line-opacity": 1 } }, LABELS_LAYER_ID);
    }

    // Admin 1 actifs — directement in_scope OU parent d'Admin 2 sélectionnés
    // Ajouté APRÈS Admin2 pour être visible par-dessus
    {
      const admin2InScope2 = admin2.filter(f => f.properties.in_scope);
      const parentIds2 = new Set(admin2InScope2.map(f => f.properties.parent_id).filter(Boolean));
      // Admin 1 directement sélectionnés
      const admin1DirectScope = admin1.filter(f => f.properties.in_scope);
      // Admin 1 parents d'Admin 2 sélectionnés
      const admin1ParentScope = admin1.filter(f => parentIds2.has(f.properties.id));
      // Union des deux
      const activeIds = new Set([...admin1DirectScope, ...admin1ParentScope].map(f => f.properties.id));
      const admin1Active = admin1.filter(f => activeIds.has(f.properties.id));

      if (admin1Active.length && !map.getSource("proj-admin1-active")) {
        map.addSource("proj-admin1-active", { type: "geojson", data: { type: "FeatureCollection", features: admin1Active } });
        map.addLayer({ id: "proj-admin1-active-fill", type: "fill", source: "proj-admin1-active",
          paint: { "fill-color": "#0EB584", "fill-opacity": 0.20 } }, LABELS_LAYER_ID);
        map.addLayer({ id: "proj-admin1-active-line", type: "line", source: "proj-admin1-active",
          paint: { "line-color": "#09815F", "line-width": 2.5, "line-opacity": 1 } }, LABELS_LAYER_ID);
      }
    }

    // Tooltip
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12,
      className: "arbm-popup" });

    // Calculé à chaque survol : les couches GIS téléversées apparaissent et
    // disparaissent indépendamment de cet effet. Elles passent en premier pour
    // gagner sur le périmètre GADM quand elles se superposent.
    function queryLayers() {
      const assetIds = assetLayersRef.current.flatMap(({ asset }) => [
        `gis-asset-${asset.id}-point`,
        `gis-asset-${asset.id}-line`,
        `gis-asset-${asset.id}-fill`,
      ]);
      return [...assetIds,
              "proj-admin2-fill", "proj-admin1-fill", "proj-country-fill",
              "gadm-admin1-fill"]
        .filter(l => map.getLayer(l));
    }

    function onMouseMove(e) {
      const feats = map.queryRenderedFeatures(e.point, { layers: queryLayers() });
      if (!feats.length) { map.getCanvas().style.cursor = ""; popup.remove(); return; }
      map.getCanvas().style.cursor = "pointer";

      const hit = feats[0];
      const p   = hit.properties || {};

      if (hit.layer.id.startsWith("gis-asset-")) {
        const asset = assetLayersRef.current
          .find(l => hit.layer.id === `gis-asset-${l.asset.id}-point`
                  || hit.layer.id === `gis-asset-${l.asset.id}-line`
                  || hit.layer.id === `gis-asset-${l.asset.id}-fill`)?.asset;
        // Le type (le dossier KML) est l'information la plus utile du fichier :
        // il passe devant le nom de la couche.
        const kind = p._layer || asset?.name || "GIS layer";
        popup.setLngLat(e.lngLat).setHTML(
          `<div style="font-family:-apple-system,sans-serif;padding:8px 12px;min-width:120px;max-width:260px">
            <div style="font-size:13px;font-weight:600;color:#2B2B2B">${escapeHtml(p._label || "—")}</div>
            <div style="font-size:10px;font-weight:600;color:#545454;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(kind)}</div>
            ${p._layer && asset?.name
              ? `<div style="font-size:10px;color:#A7A7A7;margin-top:2px">${escapeHtml(asset.name)}</div>`
              : ""}
          </div>`
        ).addTo(map);
        return;
      }

      const levelLabel = p.level === 0 ? "Country" : p.level === 1 ? "Admin 1" : "Admin 2";
      const color      = p.level === 2 ? "#0089C5" : "#09815F";
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="font-family:-apple-system,sans-serif;padding:8px 12px;min-width:120px">
          <div style="font-size:13px;font-weight:600;color:#2B2B2B">${p.name || p.country_name || "—"}</div>
          <div style="font-size:10px;font-weight:600;color:${color};margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${levelLabel}</div>
        </div>`
      ).addTo(map);
    }
    function onMouseLeave() { map.getCanvas().style.cursor = ""; popup.remove(); }

    map.on("mousemove", onMouseMove);
    map.on("mouseleave", onMouseLeave);

    // Bbox
    if (features.length) {
      const bbox = getBbox(features);
      map.fitBounds(bbox, { padding: 24, maxZoom: 9, duration: 900 });
    }

    // Sans ce retrait, un handler s'ajoutait à chaque exécution de l'effet.
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseleave", onMouseLeave);
      popup.remove();
    };
  }, [mapReady, geojson]);

  // Couches GIS téléversées — effet distinct de celui du périmètre GADM, qui
  // reste inchangé.
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    const style = map.getStyle() || {};
    (style.layers || []).forEach(l => {
      if (l.id.startsWith("gis-asset-") && map.getLayer(l.id)) map.removeLayer(l.id);
    });
    Object.keys(style.sources || {}).forEach(id => {
      if (id.startsWith("gis-asset-") && map.getSource(id)) map.removeSource(id);
    });

    assetLayersRef.current.forEach(({ asset, geojson: data }) => {
      const sourceId = `gis-asset-${asset.id}`;
      // Un fichier à plusieurs sous-couches (un dossier KML = une couche) est
      // peint par sous-couche ; sinon, la couleur de l'asset.
      const color = colorExpression(layerNames(data), asset.layer_color || "#E2725B");
      map.addSource(sourceId, { type: "geojson", data });

      // Un même fichier peut porter polygones, lignes et points à la fois :
      // trois couches filtrées par type plutôt qu'un pari sur la géométrie.
      map.addLayer({ id: `${sourceId}-fill`, type: "fill", source: sourceId,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": color, "fill-opacity": 0.25 } }, LABELS_LAYER_ID);
      map.addLayer({ id: `${sourceId}-line`, type: "line", source: sourceId,
        filter: ["any", ["==", ["geometry-type"], "Polygon"],
                        ["==", ["geometry-type"], "LineString"]],
        paint: { "line-color": color, "line-width": 2, "line-opacity": 0.95 } }, LABELS_LAYER_ID);
      map.addLayer({ id: `${sourceId}-point`, type: "circle", source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": color,
                 "circle-stroke-width": 1.5, "circle-stroke-color": "#FFFFFF" } }, LABELS_LAYER_ID);
    });

    // Le cadrage initial appartient au périmètre GADM ; on ne s'en saisit que
    // s'il n'y a aucune géométrie GADM à cadrer.
    if (!geojson?.features?.length && assetLayersRef.current.length) {
      const all = assetLayersRef.current.flatMap(l => l.geojson.features);
      if (all.length) map.fitBounds(getBbox(all), { padding: 24, maxZoom: 12, duration: 900 });
    }
  }, [mapReady, assetSignature, geojson]);

  if (!projectId || !countries.length) return null;

  const scopeCount = geojson?.features?.filter(f => f.properties.in_scope && f.properties.level > 0).length || 0;

  function recenter() {
    const map = mapInst.current;
    if (!map) return;
    // Recentrer sur tout ce qui est dessiné : périmètre GADM et couches GIS.
    const features = [
      ...(geojson?.features || []),
      ...assetLayers.flatMap(l => l.geojson.features),
    ];
    if (!features.length) return;
    map.fitBounds(getBbox(features), { padding: 24, maxZoom: 9, duration: 700 });
  }

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden",
      border: "1px solid #ECEBE8", marginBottom: 4, }}>

      {/* Style overrides contrôles natifs MapLibre */}
      <style>{`
        .maplibregl-ctrl-group {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10) !important;
          border: 1px solid #ECEBE8 !important;
          overflow: hidden;
        }
        .maplibregl-ctrl-group button {
          width: 32px !important; height: 32px !important;
          background: rgba(255,255,255,0.95) !important;
          border: none !important;
          border-bottom: 1px solid #ECEBE8 !important;
        }
        .maplibregl-ctrl-group button:last-child { border-bottom: none !important; }
        .maplibregl-ctrl-group button:hover { background: #EFFFFA !important; }
        .maplibregl-ctrl-group button span { filter: none !important; }
        .maplibregl-ctrl-scale {
          background: rgba(255,255,255,0.85) !important;
          border: 1px solid #ECEBE8 !important;
          border-radius: 4px !important;
          font-size: 10px !important;
          color: #7E7E7E !important;
          padding: 1px 5px !important;
        }
        .arbm-popup .maplibregl-popup-content {
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
          border: 1px solid #ECEBE8 !important;
        }
        .arbm-popup .maplibregl-popup-tip { display: none !important; }
      `}</style>

      {/* Bouton Recenter */}
      <button onClick={recenter}
        title="Recentrer sur le projet"
        style={{
          position: "absolute", top: 160, left: 12, zIndex: 10,
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #ECEBE8",
          boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, transition: "background .15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#EFFFFA"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.95)"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#545454" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
      </button>

      {/* Légende */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        background: "rgba(255,255,255,0.95)", borderRadius: 10,
        padding: "10px 14px", fontSize: 11,
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(0,0,0,0.06)",
        minWidth: 150,
      }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#545454",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Geographic scope
        </div>
        {countries.map(c => (
          <div key={c.iso2} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3,
              background: "#0EB584", border: "1.5px solid #09815F", flexShrink: 0 }} />
            <span style={{ color: "#545454", fontSize: 12 }}>{c.flag} {c.name}</span>
            {c.is_lead && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#09815F",
                background: "#EFFFFA", padding: "1px 5px", borderRadius: 99 }}>LEAD</span>
            )}
          </div>
        ))}
        {scopeCount > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #ECEBE8",
            display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3,
              background: "#0089C5", border: "1.5px solid #0089C5", flexShrink: 0 }} />
            <span style={{ color: "#545454", fontSize: 11 }}>
              {scopeCount} intervention zone{scopeCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #ECEBE8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#09815F" strokeWidth="1.5" strokeDasharray="4,2"/></svg>
            <span style={{ fontSize: 10, color: "#A7A7A7" }}>Admin 1 (region)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#0089C5" strokeWidth="1.5"/></svg>
            <span style={{ fontSize: 10, color: "#A7A7A7" }}>Admin 2 (district)</span>
          </div>
        </div>
        {assetLayers.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #ECEBE8" }}>
            <div style={{ fontWeight: 700, fontSize: 10, color: "#A7A7A7",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
              GIS layers
            </div>
            {assetLayers.map(({ asset, geojson: data }) => {
              const names = layerNames(data);
              return (
                <div key={asset.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  {/* Plusieurs sous-couches : un ruban des premières couleurs
                      plutôt qu'une pastille qui mentirait sur ce qui est peint. */}
                  <span style={{ display: "flex", flexShrink: 0, borderRadius: 3, overflow: "hidden",
                    width: 12, height: 12, border: "1px solid rgba(0,0,0,0.10)" }}>
                    {(names.length ? names.slice(0, 4) : [null]).map((name, i) => (
                      <span key={name ?? i} style={{ flex: 1,
                        background: names.length ? layerColor(i) : asset.layer_color }} />
                    ))}
                  </span>
                  <span style={{ color: "#545454", fontSize: 11 }}>{asset.name}</span>
                  {names.length > 1 && (
                    <span style={{ fontSize: 9, color: "#A7A7A7" }}>{names.length} types</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5,
          background: "#F7F6F6", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, color: "#A7A7A7" }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      <div ref={mapRef} style={{ height: 380, width: "100%" }} />

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9,
        color: "#A7A7A7", zIndex: 5, background: "rgba(255,255,255,0.7)",
        padding: "2px 6px", borderRadius: 4 }}>
        {ATTRIBUTION}
      </div>
    </div>
  );
}

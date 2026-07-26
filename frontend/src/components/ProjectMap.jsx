/**
 * ProjectMap — Carte géographique projet
 * Style flat minimaliste + eau bleu pâle (D+B)
 * Source : /api/projects/<pk>/geojson/ → PostGIS GADM
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const MARTIN_URL = "/martin";

const STYLE = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    // Tuiles vectorielles Martin PostGIS — GADM Admin 1/2
    "martin-gadm": {
      type: "vector",
      tiles: [`${MARTIN_URL}/gadm_area/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: 14,
    },
    // Fond monde — Natural Earth (pays, océans)
    "ne-countries": {
      type: "geojson",
      data: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    },
    "ne-ocean": {
      type: "geojson",
      data: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_ocean.geojson",
    },
  },
  layers: [
    { id: "bg",           type: "background", paint: { "background-color": "#EDEDEA" } },
    { id: "ocean",        type: "fill",   source: "ne-ocean",
      paint: { "fill-color": "#E0EBF0" } },
    { id: "land-fill",    type: "fill",   source: "ne-countries",
      paint: { "fill-color": "#EDEDEA" } },
    { id: "land-border",  type: "line",   source: "ne-countries",
      paint: { "line-color": "#FFFFFF", "line-width": 1.2 } },
    // Admin 1 GADM (fond — toutes les régions du monde)
    { id: "gadm-admin1-fill", type: "fill",   source: "martin-gadm", "source-layer": "gadm_area",
      filter: ["==", ["get", "level"], 1],
      paint: { "fill-color": "#EDEDEA", "fill-opacity": 0 } },
    { id: "gadm-admin1-line", type: "line",   source: "martin-gadm", "source-layer": "gadm_area",
      filter: ["==", ["get", "level"], 1],
      paint: { "line-color": "#d4d4d0", "line-width": 0.4 } },
  ],
};

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

  // Init carte avec style custom
  useEffect(() => {
    if (!mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
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
        paint: { "fill-color": "#A4C53F", "fill-opacity": 0.18 } });
      map.addLayer({ id: "proj-country-border", type: "line", source: "proj-country",
        paint: { "line-color": "#7a9420", "line-width": 2, "line-opacity": 0.9 } });
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
        paint: { "fill-color": "#A4C53F", "fill-opacity": 0.08 } });
      map.addLayer({ id: "proj-admin1-line", type: "line", source: "proj-admin1",
        paint: { "line-color": "#7a9420", "line-width": 0.6, "line-dasharray": [4, 3], "line-opacity": 0.4 } });

    }

    // Admin 2 scope — navy
    if (admin2.length) {
      map.addSource("proj-admin2", { type: "geojson", data: { type: "FeatureCollection", features: admin2 } });
      map.addLayer({ id: "proj-admin2-fill", type: "fill", source: "proj-admin2",
        paint: { "fill-color": "#1B5A8C", "fill-opacity": 0.40 } });
      map.addLayer({ id: "proj-admin2-line", type: "line", source: "proj-admin2",
        paint: { "line-color": "#1B5A8C", "line-width": 1.5, "line-opacity": 1 } });
    }

    // Admin 1 avec Admin 2 sélectionnés — bordure pleine lime APRÈS Admin2 pour être au-dessus
    {
      const admin2InScope2 = admin2.filter(f => f.properties.in_scope);
      const parentIds2 = new Set(admin2InScope2.map(f => f.properties.parent_id).filter(Boolean));
      const admin1WithChildren2 = admin1.filter(f => parentIds2.has(f.properties.id));
      if (admin1WithChildren2.length && !map.getSource("proj-admin1-active")) {
        map.addSource("proj-admin1-active", { type: "geojson", data: { type: "FeatureCollection", features: admin1WithChildren2 } });
        map.addLayer({ id: "proj-admin1-active-fill", type: "fill", source: "proj-admin1-active",
          paint: { "fill-color": "#A4C53F", "fill-opacity": 0.15 } });
        map.addLayer({ id: "proj-admin1-active-line", type: "line", source: "proj-admin1-active",
          paint: { "line-color": "#7a9420", "line-width": 3, "line-opacity": 1 } });
      }
    }

    // Tooltip
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12,
      className: "arbm-popup" });
    const QUERY_LAYERS = ["proj-admin2-fill","proj-admin1-fill","proj-country-fill",
                          "gadm-admin1-fill"]
      .filter(l => map.getLayer(l));

    map.on("mousemove", e => {
      const feats = map.queryRenderedFeatures(e.point, { layers: QUERY_LAYERS });
      if (!feats.length) { map.getCanvas().style.cursor = ""; popup.remove(); return; }
      map.getCanvas().style.cursor = "pointer";
      const p = feats[0].properties || {};
      const levelLabel = p.level === 0 ? "Country" : p.level === 1 ? "Admin 1" : "Admin 2";
      const color      = p.level === 2 ? "#1B5A8C" : "#7a9420";
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="font-family:-apple-system,sans-serif;padding:8px 12px;min-width:120px">
          <div style="font-size:13px;font-weight:600;color:#111">${p.name || p.country_name || "—"}</div>
          <div style="font-size:10px;font-weight:600;color:${color};margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${levelLabel}</div>
        </div>`
      ).addTo(map);
    });
    map.on("mouseleave", () => { map.getCanvas().style.cursor = ""; popup.remove(); });

    // Bbox
    if (features.length) {
      const bbox = getBbox(features);
      map.fitBounds(bbox, { padding: 48, maxZoom: 8, duration: 900 });
    }
  }, [mapReady, geojson]);

  if (!projectId || !countries.length) return null;

  const scopeCount = geojson?.features?.filter(f => f.properties.in_scope && f.properties.level > 0).length || 0;

  function recenter() {
    const map = mapInst.current;
    if (!map || !geojson?.features?.length) return;
    const bbox = getBbox(geojson.features);
    map.fitBounds(bbox, { padding: 48, maxZoom: 8, duration: 700 });
  }

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden",
      border: "1px solid #e5e7eb", marginBottom: 4,
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

      {/* Style overrides contrôles natifs MapLibre */}
      <style>{`
        .maplibregl-ctrl-group {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10) !important;
          border: 1px solid #e5e7eb !important;
          overflow: hidden;
        }
        .maplibregl-ctrl-group button {
          width: 32px !important; height: 32px !important;
          background: rgba(255,255,255,0.95) !important;
          border: none !important;
          border-bottom: 1px solid #f0f0ee !important;
        }
        .maplibregl-ctrl-group button:last-child { border-bottom: none !important; }
        .maplibregl-ctrl-group button:hover { background: #f0f6dc !important; }
        .maplibregl-ctrl-group button span { filter: none !important; }
        .maplibregl-ctrl-scale {
          background: rgba(255,255,255,0.85) !important;
          border: 1px solid #ccc !important;
          border-radius: 4px !important;
          font-size: 10px !important;
          color: #6b7280 !important;
          padding: 1px 5px !important;
        }
        .arbm-popup .maplibregl-popup-content {
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
          border: 1px solid #e5e7eb !important;
        }
        .arbm-popup .maplibregl-popup-tip { display: none !important; }
      `}</style>

      {/* Bouton Recenter */}
      <button onClick={recenter}
        title="Recentrer sur le projet"
        style={{
          position: "absolute", top: 142, left: 12, zIndex: 10,
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, transition: "background .15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#f0f6dc"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.95)"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <div style={{ fontWeight: 700, fontSize: 11, color: "#374151",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Geographic scope
        </div>
        {countries.map(c => (
          <div key={c.iso2} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3,
              background: "#A4C53F", border: "1.5px solid #7a9420", flexShrink: 0 }} />
            <span style={{ color: "#374151", fontSize: 12 }}>{c.flag} {c.name}</span>
            {c.is_lead && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#7a9420",
                background: "#f0f6dc", padding: "1px 5px", borderRadius: 99 }}>LEAD</span>
            )}
          </div>
        ))}
        {scopeCount > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #f0f0ee",
            display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3,
              background: "#1B5A8C", border: "1.5px solid #1B5A8C", flexShrink: 0 }} />
            <span style={{ color: "#374151", fontSize: 11 }}>
              {scopeCount} intervention zone{scopeCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #f0f0ee" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#7a9420" strokeWidth="1.5" strokeDasharray="4,2"/></svg>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Admin 1 (region)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#1B5A8C" strokeWidth="1.5"/></svg>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Admin 2 (district)</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5,
          background: "#EDEDEA", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af" }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      <div ref={mapRef} style={{ height: 380, width: "100%" }} />

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9,
        color: "#9ca3af", zIndex: 5, background: "rgba(255,255,255,0.7)",
        padding: "2px 6px", borderRadius: 4 }}>
        © Natural Earth · GADM · ARBM-MIS
      </div>
    </div>
  );
}

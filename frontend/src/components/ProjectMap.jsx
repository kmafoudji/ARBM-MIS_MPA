import "maplibre-gl/dist/maplibre-gl.css";
 * Source : /api/projects/<pk>/geojson/ → PostGIS + GADM
 * Admin 1 (toujours) · Admin 2 (si dans project_gadm_scope)
 * Fond : OpenStreetMap raster
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const COLORS = {
  country: { fill: "#A4C53F", fillOpacity: 0.15, line: "#7a9420", lineWidth: 2 },
  admin1:  { fill: "#A4C53F", fillOpacity: 0.25, line: "#7a9420", lineWidth: 1 },
  admin2:  { fill: "#1B5A8C", fillOpacity: 0.35, line: "#1B5A8C", lineWidth: 1 },
  scope:   { fill: "#1B5A8C", fillOpacity: 0.50, line: "#1B5A8C", lineWidth: 2 },
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
  return [[minLng - 1, minLat - 1], [maxLng + 1, maxLat + 1]];
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

  // Init carte
  useEffect(() => {
    if (!mapRef.current) return;
    let map;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
        },
        center: [20, 10], zoom: 3,
        attributionControl: false,
      });
      mapInst.current = map;
      map.on("load", () => setMapReady(true));
    });
    return () => { map?.remove(); mapInst.current = null; setMapReady(false); };
  }, []);

  // Ajouter les couches quand la carte et les données sont prêtes
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !geojson?.features?.length) return;

    const features = geojson.features;

    // Séparer par niveau
    const countries0  = features.filter(f => f.properties.level === 0);
    const admin1      = features.filter(f => f.properties.level === 1);
    const admin2      = features.filter(f => f.properties.level === 2);
    const scopeAreas  = features.filter(f => f.properties.in_scope && f.properties.level > 0);

    // Nettoyer les couches existantes
    ["scope-fill","scope-line","admin1-fill","admin1-line",
     "admin2-fill","admin2-line","country-fill","country-line"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["country-src","admin1-src","admin2-src","scope-src"].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });

    // Pays (fond)
    if (countries0.length) {
      map.addSource("country-src", { type: "geojson", data: { type: "FeatureCollection", features: countries0 } });
      map.addLayer({ id: "country-fill", type: "fill", source: "country-src",
        paint: { "fill-color": COLORS.country.fill, "fill-opacity": COLORS.country.fillOpacity } });
      map.addLayer({ id: "country-line", type: "line", source: "country-src",
        paint: { "line-color": COLORS.country.line, "line-width": COLORS.country.lineWidth } });
    }

    // Admin 1
    if (admin1.length) {
      map.addSource("admin1-src", { type: "geojson", data: { type: "FeatureCollection", features: admin1 } });
      map.addLayer({ id: "admin1-fill", type: "fill", source: "admin1-src",
        paint: { "fill-color": COLORS.admin1.fill, "fill-opacity": COLORS.admin1.fillOpacity } });
      map.addLayer({ id: "admin1-line", type: "line", source: "admin1-src",
        paint: { "line-color": COLORS.admin1.line, "line-width": COLORS.admin1.lineWidth } });
    }

    // Admin 2 (scope)
    if (admin2.length) {
      map.addSource("admin2-src", { type: "geojson", data: { type: "FeatureCollection", features: admin2 } });
      map.addLayer({ id: "admin2-fill", type: "fill", source: "admin2-src",
        paint: { "fill-color": COLORS.admin2.fill, "fill-opacity": COLORS.admin2.fillOpacity } });
      map.addLayer({ id: "admin2-line", type: "line", source: "admin2-src",
        paint: { "line-color": COLORS.admin2.line, "line-width": COLORS.admin2.lineWidth } });
    }

    // Tooltip
    import("maplibre-gl").then(({ default: mgl }) => {
      const popup = new mgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      ["admin1-fill","admin2-fill","country-fill"].forEach(layer => {
        if (!map.getLayer(layer)) return;
        map.on("mousemove", layer, e => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features[0]?.properties || {};
          const levelLabel = p.level === 0 ? "Country" : p.level === 1 ? "Admin 1" : "Admin 2";
          popup.setLngLat(e.lngLat).setHTML(
            `<div style="font-size:12px;padding:4px 8px;">
              <strong>${p.name || p.country_name}</strong>
              <span style="color:#9ca3af;margin-left:6px">${levelLabel}</span>
            </div>`
          ).addTo(map);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      });
    });

    // Fitter sur les features
    if (features.length) {
      const bbox = getBbox(features);
      map.fitBounds(bbox, { padding: 40, maxZoom: 9, duration: 800 });
    }
  }, [mapReady, geojson]);

  if (!projectId || !countries.length) return null;

  const scopeCount = geojson?.features?.filter(f => f.properties.in_scope && f.properties.level > 0).length || 0;

  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: 16 }}>
      {/* Légende */}
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: "rgba(255,255,255,0.93)", borderRadius: 8,
        padding: "10px 14px", fontSize: 11, boxShadow: "0 2px 8px #0001",
        minWidth: 160,
      }}>
        <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6, fontSize: 12 }}>
          Geographic Scope
        </div>
        {countries.map(c => (
          <div key={c.iso2} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: "#A4C53F", flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{c.flag} {c.name}</span>
            {c.is_lead && <span style={{ fontSize: 9, color: "#A4C53F", fontWeight: 700 }}>LEAD</span>}
          </div>
        ))}
        {scopeCount > 0 && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #f0f0ee" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: "#1B5A8C", flexShrink: 0 }} />
              <span style={{ color: "#374151" }}>{scopeCount} intervention zone{scopeCount > 1 ? "s" : ""}</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #f0f0ee", display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 20, height: 2, background: "#7a9420", display: "inline-block" }} />
            <span style={{ color: "#9ca3af" }}>Admin 1 (region)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 20, height: 2, background: "#1B5A8C", display: "inline-block" }} />
            <span style={{ color: "#9ca3af" }}>Admin 2 (district)</span>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {(isLoading) && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          background: "#f8fafc88", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af",
        }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      <div ref={mapRef} style={{ height: 380, width: "100%" }} />

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 4, left: 8, fontSize: 9, color: "#9ca3af", zIndex: 5 }}>
        © OpenStreetMap · GADM
      </div>
    </div>
  );
}

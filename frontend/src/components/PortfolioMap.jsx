/**
 * PortfolioMap — portfolio-wide project map
 * One point per project (from /api/projects/map/); clicking a point opens
 * a popup linking to the project detail. Same flat basemap as ProjectMap,
 * without the Martin vector tiles (points need no admin boundaries).
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const STYLE = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    // World basemap — Natural Earth (countries, oceans)
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
    { id: "bg",          type: "background", paint: { "background-color": "#EDEDEA" } },
    { id: "ocean",       type: "fill", source: "ne-ocean",
      paint: { "fill-color": "#E0EBF0" } },
    { id: "land-fill",   type: "fill", source: "ne-countries",
      paint: { "fill-color": "#EDEDEA" } },
    { id: "land-border", type: "line", source: "ne-countries",
      paint: { "line-color": "#FFFFFF", "line-width": 1.2 } },
    { id: "country-labels", type: "symbol", source: "ne-countries",
      layout: {
        "symbol-placement": "point",
        "text-field": ["get", "NAME"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 5, 13],
        "text-padding": 4,
      },
      paint: {
        "text-color": "#7E7E7E",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.2,
      } },
  ],
};

// --lime design token; CSS variables cannot reach the WebGL canvas
const FALLBACK_COLOR = "#0EB584";

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

// `compact` renders a shorter, quieter map for dashboards: no fullscreen or
// scale control and no scroll-wheel zoom, so the page keeps scrolling.
export default function PortfolioMap({ projects = [], onProjectClick, compact = false }) {
  const mapRef  = useRef(null);
  const mapInst = useRef(null);
  const popupRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // The popup DOM lives outside React — keep the latest callback in a ref
  // so its click handler never goes stale.
  const onProjectClickRef = useRef(onProjectClick);
  useEffect(() => { onProjectClickRef.current = onProjectClick; });

  const { data: geojson, isLoading } = useQuery({
    queryKey: ["projects", "map-points"],
    queryFn:  () => apiFetch("/api/projects/map/"),
    staleTime: 5 * 60_000,
  });

  // Map init
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
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
    if (compact) {
      map.scrollZoom.disable();
    } else {
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-right");
      map.addControl(new maplibregl.FullscreenControl(), "top-left");
    }
    map.on("load", () => {
      if (map.isStyleLoaded()) {
        setMapReady(true);
      } else {
        map.once("idle", () => setMapReady(true));
      }
    });
    map.on("webglcontextlost", () => setMapReady(false));
    map.on("webglcontextrestored", () => map.once("idle", () => setMapReady(true)));

    map.on("click", "proj-points", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      const el = document.createElement("div");
      el.style.cssText = "font-family:inherit;padding:10px 12px;min-width:180px";
      const title = document.createElement("div");
      title.textContent = p.name || "—";
      title.style.cssText = "font-size:13px;font-weight:600;color:#2B2B2B;margin-bottom:2px";
      const sub = document.createElement("div");
      sub.textContent = [p.official_reference_number, p.lead_country_name].filter(v => v && v !== "null").join(" · ");
      sub.style.cssText = "font-size:11px;color:#9ca3af;margin-bottom:8px";
      const btn = document.createElement("button");
      btn.textContent = "Open project →";
      btn.style.cssText = "font-size:12px;font-weight:600;color:#0C9A71;background:none;border:none;padding:0;cursor:pointer";
      // MapLibre stringifies feature properties in event payloads
      btn.addEventListener("click", () => onProjectClickRef.current?.(Number(p.id)));
      el.append(title, sub, btn);
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ offset: 12, className: "arbm-popup" })
        .setLngLat(f.geometry.coordinates)
        .setDOMContent(el)
        .addTo(map);
    });
    map.on("mouseenter", "proj-points", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "proj-points", () => { map.getCanvas().style.cursor = ""; });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapInst.current = null;
      setMapReady(false);
    };
  }, []);

  // Project points — re-filtered whenever the page filters change
  const ids = new Set(projects.map(p => p.id));
  const feats = (geojson?.features || []).filter(f => ids.has(f.properties.id));

  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !geojson) return;
    if (!map.isStyleLoaded()) return;

    popupRef.current?.remove();
    popupRef.current = null;

    ["proj-points", "proj-points-halo"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("proj-points")) map.removeSource("proj-points");

    map.addSource("proj-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: feats },
    });
    map.addLayer({ id: "proj-points-halo", type: "circle", source: "proj-points",
      paint: {
        "circle-radius": 11,
        "circle-color": ["coalesce", ["get", "primary_sector_color"], FALLBACK_COLOR],
        "circle-opacity": 0.25,
      } });
    map.addLayer({ id: "proj-points", type: "circle", source: "proj-points",
      paint: {
        "circle-radius": 6,
        "circle-color": ["coalesce", ["get", "primary_sector_color"], FALLBACK_COLOR],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      } });

    if (feats.length) {
      map.fitBounds(getBbox(feats), { padding: 48, maxZoom: 6, duration: 900 });
    }
  }, [mapReady, geojson, projects]);

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden",
      border: "1px solid #e5e7eb" }}>

      {/* Style overrides for native MapLibre controls */}
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
        .maplibregl-ctrl-group button:hover { background: #EFFFFA !important; }
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

      {/* Loading */}
      {isLoading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5,
          background: "#EDEDEA", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af" }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      {/* Empty state (loaded, but no project matches the filters) */}
      {!isLoading && geojson && feats.length === 0 && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 5, background: "rgba(255,255,255,0.95)", borderRadius: 10,
          padding: "8px 14px", fontSize: 12, color: "#6b7280",
          border: "1px solid #e5e7eb" }}>
          No projects to display on the map
        </div>
      )}

      <div ref={mapRef} style={{ height: compact ? 300 : 520, width: "100%" }} />

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9,
        color: "#9ca3af", zIndex: 5, background: "rgba(255,255,255,0.7)",
        padding: "2px 6px", borderRadius: 4 }}>
        © Natural Earth · GADM · ARBM-MIS
      </div>
    </div>
  );
}

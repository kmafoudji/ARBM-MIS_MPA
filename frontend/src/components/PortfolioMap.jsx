/**
 * PortfolioMap — portfolio-wide project map
 * One point per project (from /api/projects/map/); clicking a point opens
 * a popup linking to the project detail. Basemap shared with ProjectMap
 * (mapStyle.js); the points sit on top of every label.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { ATTRIBUTION, BASEMAP_STYLE } from "./mapStyle.js";

// --lime design token; CSS variables cannot reach the WebGL canvas
const FALLBACK_COLOR = "#0EB584";

// Donut for a cluster: sector colours in proportion, the count in the middle.
function clusterElement(leaves) {
  const counts = new Map();
  leaves.forEach((l) => {
    const c = l.properties.primary_sector_color || FALLBACK_COLOR;
    counts.set(c, (counts.get(c) || 0) + 1);
  });
  let acc = 0;
  const stops = [...counts].map(([color, n]) => {
    const from = acc; acc += (n / leaves.length) * 360;
    return `${color} ${from}deg ${acc}deg`;
  });
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:26px;height:26px;border-radius:50%;cursor:pointer;" +
    "box-shadow:0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,0.25);" +
    `background:conic-gradient(${stops.join(",")})`;
  const inner = document.createElement("div");
  inner.textContent = String(leaves.length);
  inner.style.cssText = "position:absolute;inset:6px;border-radius:50%;background:#fff;" +
    "display:flex;align-items:center;justify-content:center;" +
    "font:700 10px/1 system-ui,sans-serif;color:#2B2B2B";
  el.append(inner);
  return el;
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

// `compact` renders a shorter, quieter map for dashboards: no fullscreen or
// scale control and no scroll-wheel zoom, so the page keeps scrolling.
export default function PortfolioMap({ projects = [], onProjectClick, compact = false }) {
  const mapRef  = useRef(null);
  const mapInst = useRef(null);
  const popupRef = useRef(null);
  const hoverRef = useRef(null);
  // Clusters are HTML markers (a donut of sector colours cannot be drawn by
  // a circle layer); the handlers are set at map init, the markers later.
  const clusterHandlersRef = useRef({});
  const clusterMarkersRef = useRef(new Map());
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
      style: BASEMAP_STYLE,
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
    // In compact mode the container is sized by flex layout, which may
    // settle after the map measured itself: follow the container's size.
    const ro = compact && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => map.resize()) : null;
    ro?.observe(mapRef.current);
    map.on("load", () => {
      if (map.isStyleLoaded()) {
        setMapReady(true);
      } else {
        map.once("idle", () => setMapReady(true));
      }
    });
    map.on("webglcontextlost", () => setMapReady(false));
    map.on("webglcontextrestored", () => map.once("idle", () => setMapReady(true)));

    // MapLibre stringifies feature properties in event payloads: null → "null".
    const clean = (v) => (v && v !== "null" ? v : null);
    const div = (text, css) => {
      const d = document.createElement("div");
      d.textContent = text;
      d.style.cssText = css;
      return d;
    };

    const hover = new maplibregl.Popup({
      offset: 12, className: "arbm-popup arbm-popup-hover",
      closeButton: false, closeOnClick: false,
    });
    hoverRef.current = hover;
    const sectorDot = (color) => {
      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:${clean(color) || FALLBACK_COLOR}`;
      return dot;
    };
    const openCard = (lngLat, el) => {
      hoverRef.current?.remove();
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ offset: 12, className: "arbm-popup", maxWidth: "320px" })
        .setLngLat(lngLat)
        .setDOMContent(el)
        .addTo(map);
      popupRef.current.on("close", () => { popupRef.current = null; });
    };

    // Click: the project card — full name, reference, pillar › sector with
    // the sector colour (the same colour as the point), stage, and the link.
    map.on("click", "proj-points", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      const el = document.createElement("div");
      el.style.cssText = "font-family:inherit;padding:12px 14px;min-width:220px;max-width:280px";
      el.append(div(p.name || "—", "font-size:13px;font-weight:600;color:#2B2B2B;line-height:1.3"));
      const ref = [clean(p.official_reference_number), clean(p.lead_country_name)].filter(Boolean).join(" · ");
      if (ref) el.append(div(ref, "font-size:11px;color:#9ca3af;margin-top:2px"));

      const sector = clean(p.primary_sector_name);
      if (sector) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#4b5563";
        const pillar = clean(p.pillar_name);
        row.append(sectorDot(p.primary_sector_color), div(pillar ? `${pillar} › ${sector}` : sector, ""));
        el.append(row);
      }
      const stage = clean(p.lifecycle_stage_display);
      if (stage) {
        el.append(div(stage, "display:inline-block;margin-top:8px;font-size:10px;font-weight:600;color:#374151;background:#f3f4f6;border-radius:999px;padding:2px 8px"));
      }

      const btn = document.createElement("button");
      btn.textContent = "Open project →";
      btn.style.cssText = "display:block;margin-top:10px;font-size:12px;font-weight:600;color:#0C9A71;background:none;border:none;padding:0;cursor:pointer";
      btn.addEventListener("click", () => onProjectClickRef.current?.(Number(p.id)));
      el.append(btn);
      openCard(f.geometry.coordinates, el);
    });

    // Cluster card (projects whose points coincide, e.g. two projects
    // covering the same country): a list, one row per project.
    clusterHandlersRef.current.click = (lngLat, leaves) => {
      const el = document.createElement("div");
      el.style.cssText = "font-family:inherit;padding:10px 14px;min-width:240px";
      el.append(div(`${leaves.length} projects here`, "font-size:11px;color:#9ca3af;margin-bottom:6px"));
      leaves.forEach((leaf) => {
        const p = leaf.properties;
        const row = document.createElement("button");
        row.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;border-top:1px solid #f0f0ee;padding:8px 0;cursor:pointer;font-family:inherit";
        const text = document.createElement("div");
        text.style.cssText = "min-width:0";
        text.append(div(p.name || "—", "font-size:12px;font-weight:600;color:#2B2B2B;line-height:1.3"));
        const meta = [clean(p.official_reference_number), clean(p.primary_sector_name)].filter(Boolean).join(" · ");
        if (meta) text.append(div(meta, "font-size:11px;color:#6b7280;margin-top:1px"));
        row.append(sectorDot(p.primary_sector_color), text);
        row.addEventListener("click", () => onProjectClickRef.current?.(Number(p.id)));
        el.append(row);
      });
      openCard(lngLat, el);
    };
    clusterHandlersRef.current.enter = (lngLat, count) => {
      if (popupRef.current) return;
      const el = document.createElement("div");
      el.style.cssText = "font-family:inherit;padding:6px 10px;white-space:nowrap";
      el.append(div(`${count} projects · click to list`, "font-size:11px;color:#4b5563"));
      hover.setLngLat(lngLat).setDOMContent(el).addTo(map);
    };
    clusterHandlersRef.current.leave = () => hover.remove();

    // Hover: identification only — official reference and country, one line.
    // The click card replaces it and hover stays quiet while a card is open.
    map.on("mousemove", "proj-points", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || popupRef.current) return;
      const p = f.properties;
      const el = document.createElement("div");
      el.style.cssText = "font-family:inherit;padding:6px 10px;white-space:nowrap;display:flex;gap:6px;align-items:baseline";
      el.append(div(clean(p.official_reference_number) || p.name || "—", "font-size:12px;font-weight:600;color:#2B2B2B"));
      const country = clean(p.lead_country_name);
      if (country) el.append(div(country, "font-size:11px;color:#6b7280"));
      hover.setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map);
    });
    map.on("mouseleave", "proj-points", () => {
      map.getCanvas().style.cursor = "";
      hover.remove();
    });

    return () => {
      clusterMarkersRef.current.forEach(m => m.remove());
      clusterMarkersRef.current.clear();
      hoverRef.current?.remove();
      hoverRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      ro?.disconnect();
      map.remove();
      mapInst.current = null;
      setMapReady(false);
    };
  }, []);

  // Project points — re-filtered whenever the page filters change
  const ids = new Set(projects.map(p => p.id));
  const feats = (geojson?.features || []).filter(f => ids.has(f.properties.id));

  // Legend: the sectors present among the displayed points, in the point colour
  const legend = [...new Map(
    feats.map(f => [f.properties.primary_sector_name || "Sector not set",
                    f.properties.primary_sector_color || FALLBACK_COLOR])
  )].sort((a, b) => a[0].localeCompare(b[0]));

  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !geojson) return;
    if (!map.isStyleLoaded()) return;

    popupRef.current?.remove();
    popupRef.current = null;

    ["proj-points", "proj-points-halo"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    clusterMarkersRef.current.forEach(m => m.remove());
    clusterMarkersRef.current.clear();
    if (map.getSource("proj-points")) map.removeSource("proj-points");

    // Points that coincide on screen (projects covering the same country get
    // the same point-on-surface) are clustered at every zoom; a cluster is a
    // count badge whose card lists its projects.
    map.addSource("proj-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: feats },
      cluster: true,
      clusterRadius: 14,
      clusterMaxZoom: 24,
    });
    map.addLayer({ id: "proj-points-halo", type: "circle", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 11,
        "circle-color": ["coalesce", ["get", "primary_sector_color"], FALLBACK_COLOR],
        "circle-opacity": 0.25,
      } });
    map.addLayer({ id: "proj-points", type: "circle", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": ["coalesce", ["get", "primary_sector_color"], FALLBACK_COLOR],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      } });

    // Cluster markers: a ring split by sector in proportion (one colour when
    // every project shares the sector), the count in the middle. Clusters
    // change with the zoom, so they are rebuilt whenever the source settles.
    const source = map.getSource("proj-points");
    const markers = clusterMarkersRef.current;
    const syncClusters = async () => {
      const seen = new Set();
      const clusters = new Map();
      map.querySourceFeatures("proj-points").forEach((f) => {
        if (f.properties.cluster_id != null) clusters.set(f.properties.cluster_id, f);
      });
      for (const [id, f] of clusters) {
        seen.add(id);
        if (markers.has(id)) continue;
        const leaves = await source.getClusterLeaves(id, 50, 0);
        if (markers.has(id)) continue;
        const el = clusterElement(leaves);
        const lngLat = f.geometry.coordinates;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          clusterHandlersRef.current.click?.(lngLat, leaves);
        });
        el.addEventListener("mouseenter", () => clusterHandlersRef.current.enter?.(lngLat, leaves.length));
        el.addEventListener("mouseleave", () => clusterHandlersRef.current.leave?.());
        markers.set(id, new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
      }
      markers.forEach((m, id) => {
        if (!seen.has(id)) { m.remove(); markers.delete(id); }
      });
    };
    const onData = (e) => {
      if (e.sourceId === "proj-points" && e.isSourceLoaded) syncClusters();
    };
    map.on("data", onData);
    map.on("moveend", syncClusters);
    syncClusters();

    if (feats.length) {
      map.fitBounds(getBbox(feats), { padding: 48, maxZoom: 6, duration: 900 });
    }
    return () => {
      map.off("data", onData);
      map.off("moveend", syncClusters);
    };
  }, [mapReady, geojson, projects]);

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden",
      border: "1px solid #e5e7eb",
      // compact: fixed dashboard height so the row does not stretch with its neighbour
      ...(compact ? { height: 320, display: "flex" } : {}) }}>

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
        .arbm-popup-hover { pointer-events: none; }
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

      <div ref={mapRef} style={compact ? { height: "100%", width: "100%" } : { height: 520, width: "100%" }} />

      {/* Legend — colour = primary sector */}
      {legend.length > 0 && !isLoading && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 5,
          background: "rgba(255,255,255,0.92)", border: "1px solid #e5e7eb",
          borderRadius: 8, padding: compact ? "6px 8px" : "8px 10px",
          fontSize: 11, color: "#4b5563", maxWidth: 200,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "#9ca3af", marginBottom: 4 }}>
            Primary sector
          </div>
          {legend.map(([name, color]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6,
              lineHeight: compact ? "16px" : "18px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none",
                background: color, border: "1px solid rgba(0,0,0,0.08)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9,
        color: "#9ca3af", zIndex: 5, background: "rgba(255,255,255,0.7)",
        padding: "2px 6px", borderRadius: 4 }}>
        {ATTRIBUTION}
      </div>
    </div>
  );
}

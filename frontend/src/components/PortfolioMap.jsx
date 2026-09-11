/**
 * PortfolioMap — portfolio-wide project map, in the style of the LLF
 * portfolio map mockup (.dev-notes/style/mockups/aRBM-MIS_Portfolio_Map_LLF.html).
 *
 * One circle per project (points from /api/projects/map/), coloured by
 * primary sector. Projects that fall on the same spot — two projects in one
 * country share its point — are a ring of their sectors with the count in
 * the middle; while any such ring is on screen, single points take the same
 * shape with a 1, so every marker reads the same way. Clicking opens a card
 * next to the marker; the full map also shows a strip of totals (top left)
 * and takes the height of the window.
 * Basemap shared with ProjectMap (mapStyle.js).
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { ATTRIBUTION, BASEMAP_STYLE } from "./mapStyle.js";

// --lime design token; CSS variables cannot reach the WebGL canvas
const FALLBACK_COLOR = "#0EB584";
// Every project circle has the same size; in count mode it grows to the
// cluster ring's size (26 px across, as .pmap-cluster).
const POINT_RADIUS = 7;
const RING_RADIUS = 13;

function toMillions(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n / 1_000_000 : 0;
}

function formatCommitment(millions) {
  if (!millions) return "—";
  return millions >= 1000 ? `${(millions / 1000).toFixed(2)} bn` : `${millions.toFixed(1)} M`;
}

// Ring for a group of coinciding projects: sector colours in proportion,
// the count in the middle.
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
  el.className = "pmap-cluster";
  el.style.background = `conic-gradient(${stops.join(",")})`;
  const inner = document.createElement("div");
  inner.className = "pmap-cluster-count";
  inner.textContent = String(leaves.length);
  el.append(inner);
  return el;
}

function getBbox(features) {
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  features.forEach(f => {
    const [lng, lat] = f.geometry?.coordinates || [];
    if (typeof lng !== "number") return;
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });
  return [[minLng - 2, minLat - 2], [maxLng + 2, maxLat + 2]];
}

function ProjectCard({ project, point, onOpen, onZoom, onClose }) {
  const country = (project.lead_country_name || "").toUpperCase();
  const chips = [project.lifecycle_stage_display, project.primary_sector_name, project.hub_name].filter(Boolean);
  const millions = toMillions(project.envelope_total);
  const pillar = point?.properties.pillar_name;
  return (
    <>
      <div className="pmap-card-head">
        <button type="button" className="pmap-card-close" onClick={onClose} aria-label="Close">×</button>
        <div className="pmap-card-code">
          {[project.official_reference_number, country].filter(Boolean).join(" · ")}
        </div>
        <div className="pmap-card-name">{project.name}</div>
        {chips.length > 0 && (
          <div className="pmap-card-chips">
            {chips.map((c) => <span key={c} className="pmap-card-chip">{c}</span>)}
          </div>
        )}
      </div>
      <div className="pmap-card-body">
        <div className="pmap-row">
          <span className="pmap-row-k">Commitment</span>
          <span className="pmap-row-v">{millions ? `US$ ${formatCommitment(millions)}` : "—"}</span>
        </div>
        {pillar && pillar !== project.primary_sector_name && (
          <div className="pmap-row">
            <span className="pmap-row-k">Pillar</span>
            <span className="pmap-row-v">{pillar}</span>
          </div>
        )}
        {project.country_names?.length > 0 && (
          <div className="pmap-row">
            <span className="pmap-row-k">{project.country_names.length > 1 ? "Countries" : "Country"}</span>
            <span className="pmap-row-v">{project.country_names.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="pmap-card-foot">
        <button type="button" className="pmap-btn pmap-btn-primary" onClick={onOpen}>Open project →</button>
        {point?.properties.bbox && (
          <button type="button" className="pmap-btn" onClick={onZoom}>Zoom to area</button>
        )}
      </div>
    </>
  );
}

function GroupCard({ projects, onPick, onClose }) {
  const country = (projects[0]?.lead_country_name || "").toUpperCase();
  return (
    <>
      <div className="pmap-card-head">
        <button type="button" className="pmap-card-close" onClick={onClose} aria-label="Close">×</button>
        <div className="pmap-card-code">{[`${projects.length} projects`, country].filter(Boolean).join(" · ")}</div>
        <div className="pmap-card-name">Projects at this location</div>
      </div>
      <div className="pmap-card-body">
        {projects.map((p) => (
          <button key={p.id} type="button" className="pmap-group-row" onClick={() => onPick(p.id)}>
            <span className="pmap-dot" style={{ background: p.primary_sector_color || FALLBACK_COLOR }} />
            <span style={{ minWidth: 0 }}>
              <span className="pmap-group-code">{p.official_reference_number}</span>
              <span className="pmap-group-name">{p.name}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// `compact` renders a shorter, quieter map for dashboards: no totals strip,
// no fullscreen or scale control and no scroll-wheel zoom, so the page keeps
// scrolling.
export default function PortfolioMap({ projects = [], onProjectClick, compact = false }) {
  const wrapRef = useRef(null);
  const mapRef  = useRef(null);
  const mapInst = useRef(null);
  const hoverRef = useRef(null);
  // Clusters are HTML markers (a ring of sector colours cannot be drawn by a
  // circle layer); the handler is set at map init, the markers later.
  const clusterClickRef = useRef(null);
  const clusterMarkersRef = useRef(new Map());
  const [mapReady, setMapReady] = useState(false);
  // { kind: "project", id, lngLat } or { kind: "group", ids, lngLat }: the
  // card opens next to the marker at lngLat and follows it as the map moves.
  const [selected, setSelected] = useState(null);
  const cardRef = useRef(null);
  const [cardPos, setCardPos] = useState(null);
  const [height, setHeight] = useState(560);

  const { data: geojson, isLoading } = useQuery({
    queryKey: ["projects", "map-points"],
    queryFn:  () => apiFetch("/api/projects/map/"),
    staleTime: 5 * 60_000,
  });

  // The full map runs from where it starts to the bottom of the window.
  useLayoutEffect(() => {
    if (compact) return;
    const fit = () => {
      const el = wrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(480, Math.round(window.innerHeight - top - 24)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [compact]);
  useEffect(() => { mapInst.current?.resize(); }, [height]);

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
    // Bottom right as in the mockup; top left on the short dashboard map,
    // where the card would cover the bottom-right corner.
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), compact ? "top-left" : "bottom-right");
    if (compact) {
      map.scrollZoom.disable();
    } else {
      map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-right");
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
    const hover = new maplibregl.Popup({
      offset: 12, className: "arbm-popup arbm-popup-hover",
      closeButton: false, closeOnClick: false,
    });
    hoverRef.current = hover;
    const hoverContent = (title, sub) => {
      const el = document.createElement("div");
      el.className = "pmap-hover";
      const b = document.createElement("b");
      b.textContent = title;
      el.append(b);
      if (sub) {
        const s = document.createElement("span");
        s.textContent = sub;
        el.append(s);
      }
      return el;
    };

    map.on("click", "proj-points", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      hover.remove();
      setSelected({ kind: "project", id: Number(f.properties.id), lngLat: f.geometry.coordinates });
    });
    // A click on empty map closes the card.
    map.on("click", (e) => {
      if (!map.getLayer("proj-points")) return;
      if (map.queryRenderedFeatures(e.point, { layers: ["proj-points"] }).length === 0) setSelected(null);
    });
    clusterClickRef.current = (leaves, lngLat) => {
      hover.remove();
      setSelected({ kind: "group", ids: leaves.map((l) => Number(l.properties.id)), lngLat });
    };

    // Hover: identification only — official reference and country, one line.
    map.on("mousemove", "proj-points", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      hover.setLngLat(f.geometry.coordinates)
        .setDOMContent(hoverContent(clean(p.official_reference_number) || p.name || "—", clean(p.lead_country_name)))
        .addTo(map);
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
      ro?.disconnect();
      map.remove();
      mapInst.current = null;
      setMapReady(false);
    };
  }, [compact]);

  // Project points — re-filtered whenever the page filters change
  const byId = new Map(projects.map(p => [p.id, p]));
  const feats = (geojson?.features || []).filter(f => byId.has(f.properties.id));
  const pointById = new Map(feats.map(f => [f.properties.id, f]));

  // Legend: the sectors present among the displayed points, in the point colour
  const legend = [...new Map(
    feats.map(f => [f.properties.primary_sector_name || "Sector not set",
                    f.properties.primary_sector_color || FALLBACK_COLOR])
  )].sort((a, b) => a[0].localeCompare(b[0]));

  // Totals strip: the projects the page filters let through.
  const committed = projects.reduce((sum, p) => sum + toMillions(p.envelope_total), 0);
  const countries = new Set(projects.flatMap(p => p.country_names?.length ? p.country_names : [p.lead_country_name]).filter(Boolean));

  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !geojson) return;
    if (!map.isStyleLoaded()) return;

    ["proj-points", "proj-points-shadow", "proj-points-inner", "proj-points-count"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    clusterMarkersRef.current.forEach(m => m.remove());
    clusterMarkersRef.current.clear();
    if (map.getSource("proj-points")) map.removeSource("proj-points");

    // Points that coincide on screen are clustered at every zoom.
    map.addSource("proj-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: feats },
      cluster: true,
      clusterRadius: 14,
      clusterMaxZoom: 24,
    });
    // The mockup's drop shadow: a blurred dark disc just under each circle.
    map.addLayer({ id: "proj-points-shadow", type: "circle", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": POINT_RADIUS + 2,
        "circle-color": "#000000",
        "circle-opacity": 0.22,
        "circle-blur": 0.8,
        "circle-translate": [0, 1],
      } });
    map.addLayer({ id: "proj-points", type: "circle", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": POINT_RADIUS,
        "circle-color": ["coalesce", ["get", "primary_sector_color"], FALLBACK_COLOR],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      } });
    // "Count mode": while any cluster is on screen, single points take the
    // cluster's ring shape with a 1, so every marker reads the same way.
    map.addLayer({ id: "proj-points-inner", type: "circle", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      layout: { visibility: "none" },
      paint: { "circle-radius": 7, "circle-color": "#ffffff" } });
    map.addLayer({ id: "proj-points-count", type: "symbol", source: "proj-points",
      filter: ["!", ["has", "point_count"]],
      layout: {
        visibility: "none",
        "text-field": "1",
        "text-font": ["Noto Sans Bold"],
        "text-size": 10,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#2B2B2B" } });
    const setCountMode = (on) => {
      if (!map.getLayer("proj-points")) return;
      map.setPaintProperty("proj-points", "circle-radius", on ? RING_RADIUS : POINT_RADIUS);
      map.setPaintProperty("proj-points-shadow", "circle-radius", (on ? RING_RADIUS : POINT_RADIUS) + 2);
      map.setLayoutProperty("proj-points-inner", "visibility", on ? "visible" : "none");
      map.setLayoutProperty("proj-points-count", "visibility", on ? "visible" : "none");
    };

    // Cluster markers change with the zoom, so they are rebuilt whenever the
    // source settles.
    const source = map.getSource("proj-points");
    const markers = clusterMarkersRef.current;
    const syncClusters = async () => {
      const seen = new Set();
      const clusters = new Map();
      map.querySourceFeatures("proj-points").forEach((f) => {
        if (f.properties.cluster_id != null) clusters.set(f.properties.cluster_id, f);
      });
      setCountMode(clusters.size > 0);
      for (const [id, f] of clusters) {
        seen.add(id);
        if (markers.has(id)) continue;
        const leaves = await source.getClusterLeaves(id, 50, 0);
        if (markers.has(id)) continue;
        const el = clusterElement(leaves);
        el.title = `${leaves.length} projects`;
        const lngLat = f.geometry.coordinates;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          clusterClickRef.current?.(leaves, lngLat);
        });
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
      map.fitBounds(getBbox(feats), { padding: 60, maxZoom: 6, duration: 900 });
    }
    return () => {
      map.off("data", onData);
      map.off("moveend", syncClusters);
    };
  }, [mapReady, geojson, projects]);

  // A selection the filters have since removed closes the card.
  const selectedProject = selected?.kind === "project" ? byId.get(selected.id) : null;
  const groupProjects = selected?.kind === "group" ? selected.ids.map(id => byId.get(id)).filter(Boolean) : [];
  const cardOpen = !!selectedProject || groupProjects.length > 0;

  // Card placement: beside the marker, on its right unless there is no room,
  // kept inside the map; re-placed as the map moves or the card resizes.
  const placeCard = useCallback(() => {
    const map = mapInst.current;
    const card = cardRef.current;
    if (!map || !card || !selected) return;
    const pt = map.project(selected.lngLat);
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const gap = 20, margin = 8;
    let x = pt.x + gap;
    if (x + cw > w - margin) x = pt.x - gap - cw;
    x = Math.max(margin, Math.min(x, w - cw - margin));
    const y = Math.max(margin, Math.min(pt.y - 32, h - ch - margin));
    setCardPos({ x, y });
  }, [selected]);
  useLayoutEffect(() => {
    const map = mapInst.current;
    if (!cardOpen || !map) { setCardPos(null); return; }
    placeCard();
    map.on("move", placeCard);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(placeCard) : null;
    if (cardRef.current) ro?.observe(cardRef.current);
    return () => { map.off("move", placeCard); ro?.disconnect(); };
  }, [cardOpen, placeCard]);

  function zoomTo(id) {
    const bbox = pointById.get(id)?.properties.bbox;
    if (!bbox || !mapInst.current) return;
    mapInst.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, maxZoom: 8, duration: 900 });
  }

  return (
    <div ref={wrapRef} className={`pmap${compact ? " pmap-compact" : ""}`}
      style={compact ? { height: 320, display: "flex" } : undefined}>

      {isLoading && (
        <div className="pmap-loading">
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      {!isLoading && geojson && feats.length === 0 && (
        <div className="pmap-empty">No projects to display on the map</div>
      )}

      <div ref={mapRef} style={compact ? { height: "100%", width: "100%" } : { height, width: "100%" }} />

      {!compact && !isLoading && (
        <div className="pmap-strip">
          <div className="pmap-stat"><b>{projects.length}</b><span>Projects</span></div>
          <div className="pmap-stat"><b>{formatCommitment(committed)}</b><span>Committed USD</span></div>
          <div className="pmap-stat"><b>{countries.size}</b><span>Countries</span></div>
        </div>
      )}

      {legend.length > 0 && !isLoading && (
        <div className="pmap-legend">
          <h5>Primary sector</h5>
          {legend.map(([name, color]) => (
            <div key={name} className="pmap-legend-item">
              <span className="pmap-dot" style={{ background: color }} />
              <span className="pmap-legend-name">{name}</span>
            </div>
          ))}
        </div>
      )}

      {cardOpen && (
        <div ref={cardRef} className="pmap-card"
          style={{ left: cardPos?.x ?? 0, top: cardPos?.y ?? 0, visibility: cardPos ? "visible" : "hidden" }}>
          {selectedProject ? (
            <ProjectCard
              project={selectedProject}
              point={pointById.get(selectedProject.id)}
              onOpen={() => onProjectClick?.(selectedProject.id)}
              onZoom={() => zoomTo(selectedProject.id)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <GroupCard
              projects={groupProjects}
              onPick={(id) => setSelected({ kind: "project", id, lngLat: selected.lngLat })}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}

      <div className="pmap-attribution">{ATTRIBUTION}</div>
    </div>
  );
}

/**
 * PortfolioMap — portfolio-wide project map, in the style of the LLF
 * portfolio map mockup (.dev-notes/style/mockups/aRBM-MIS_Portfolio_Map_LLF.html).
 *
 * One circle per project (points from /api/projects/map/), coloured by the
 * lens the page picks — primary sector, lifecycle group, physical progress
 * or indicator performance (the mockup's "Colour by"). Projects that fall on the same spot — two projects in one
 * country share its point — are a ring of their sectors with the count in
 * the middle; while any such ring is on screen, single points take the same
 * shape with a 1, so every marker reads the same way. Clicking opens a card
 * next to the marker; the full map also shows a strip of totals (top left)
 * and takes the height of the window. The map opens on the mockup's view,
 * and a "Reset view" button (top right), shown once the view has moved,
 * brings it back there.
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

// Opening view: zoom 3, matched to the mockup as it shows on screen (its
// code says zoom 2.35 but it renders about 0.7 levels closer), centred on
// 29.6° E, 16.7° N — the framing the maintainer set by hand, West Africa to
// Iran. The short dashboard map opens one level out so the same region fits.
// "Reset view" returns here.
const HOME_VIEW = { center: [29.6, 16.7], zoom: 3 };
const HOME_VIEW_COMPACT = { center: [29.6, 16.7], zoom: 2 };
// La carte s'ouvre là, sur le globe entier, puis descend jusqu'à HOME_VIEW.
const OPENING_ZOOM = 0.4;
const OPENING_DURATION = 1600;

// Colour lenses. Each returns [legend label, colour] for a project, from the
// project list row and the map point's properties; colours are literal
// because CSS variables cannot reach the WebGL canvas (--blue, --lime,
// --lime-soft/-dark/-darker, --orange, --rose, --subtle).
const NO_DATA = "#A7A7A7";
const PROGRESS_BANDS = [   // the green tonal scale: a quantity, not a verdict
  [75, "75–100%", "#09815F"],
  [50, "50–74%", "#0C9A71"],
  [25, "25–49%", "#0EB584"],
  [0,  "0–24%",  "#C2F0E2"],
];
const PERFORMANCE = {      // ResultsData.compute_and_save_rag thresholds
  green: ["On track · ≥ 90%", "#0EB584"],
  amber: ["At risk · 60–89%", "#F49D07"],
  red:   ["Off track · < 60%", "#FB563B"],
};
const LENSES = {
  sector: {
    title: "Primary sector",
    of: (p) => [p.primary_sector_name || "Sector not set", p.primary_sector_color || FALLBACK_COLOR],
  },
  lifecycle: {
    title: "Lifecycle",
    // Origination runs to Signature (LS011), implementation from Effective.
    of: (p) => ["LS017", "LS018"].includes(p.lifecycle_stage) ? ["Suspended / cancelled", "#FB563B"]
      : Number(p.lifecycle_stage?.slice(2)) >= 12 ? ["Implementation · 12–16", "#0EB584"]
      : ["Origination · 1–11", "#0089C5"],
    order: ["Origination · 1–11", "Implementation · 12–16", "Suspended / cancelled"],
  },
  progress: {
    title: "Physical progress",
    of: (p, props) => {
      if (props.physical_progress == null) return ["No workplan", NO_DATA];
      const [, label, color] = PROGRESS_BANDS.find(([min]) => props.physical_progress >= min);
      return [label, color];
    },
    order: [...PROGRESS_BANDS.map(([, label]) => label).reverse(), "No workplan"],
  },
  performance: {
    title: "Indicator performance",
    of: (p, props) => PERFORMANCE[props.indicator_rag] || ["No value against a target", NO_DATA],
    order: [...Object.values(PERFORMANCE).map(([label]) => label), "No value against a target"],
  },
};

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
    const c = l.properties.lens_color || FALLBACK_COLOR;
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

function ProjectCard({ project, point, onOpen, onZoom, onClose }) {
  const country = (project.lead_country_name || "").toUpperCase();
  const chips = [project.lifecycle_stage_display, project.primary_sector_name, project.hub_name].filter(Boolean);
  const millions = toMillions(project.envelope_total);
  const pillar = point?.properties.pillar_name;
  const progress = point?.properties.physical_progress ?? null;
  const performance = point?.properties.indicator_performance ?? null;
  const rag = point?.properties.indicator_rag;
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
        <div className="pmap-row">
          <span className="pmap-row-k">Physical progress</span>
          {progress != null && <span className="pmap-track"><i style={{ width: `${Math.min(progress, 100)}%` }} /></span>}
          <span className="pmap-row-v">{progress != null ? `${progress}%` : "No workplan"}</span>
        </div>
        <div className="pmap-row">
          <span className="pmap-row-k">Indicators</span>
          {performance != null && (
            <span className="pmap-track">
              <i style={{ width: `${Math.min(performance, 100)}%`, background: PERFORMANCE[rag]?.[1] }} />
            </span>
          )}
          <span className="pmap-row-v">{performance != null ? `${performance}% of target` : "No value against a target"}</span>
        </div>
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

function GroupCard({ projects, colorOf, onPick, onClose }) {
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
            <span className="pmap-dot" style={{ background: colorOf(p.id) || FALLBACK_COLOR }} />
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
export default function PortfolioMap({ projects = [], onProjectClick, compact = false, colourBy = "sector" }) {
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
  const [atHome, setAtHome] = useState(true);

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
    const home = compact ? HOME_VIEW_COMPACT : HOME_VIEW;
    // Ouverture : la carte descend du globe entier jusqu'à la vue d'accueil,
    // qui ne change pas. Une animation d'entrée ne s'impose pas à qui a
    // demandé moins de mouvement : dans ce cas on ouvre directement dessus.
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: BASEMAP_STYLE,
      center: home.center,
      zoom: reduceMotion ? home.zoom : OPENING_ZOOM,
      attributionControl: false,
    });
    mapInst.current = map;
    // Bottom right as in the mockup; top left on the short dashboard map,
    // where the card would cover the bottom-right corner. A bottom corner
    // stacks each new control above the previous ones, so the scale goes in
    // first to sit under the buttons.
    if (compact) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
      map.scrollZoom.disable();
    } else {
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
      map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
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
      // Descente vers la vue d'accueil, une fois le fond chargé — sans quoi
      // l'animation se jouerait sur un canevas vide.
      if (!reduceMotion) {
        map.easeTo({ ...home, duration: OPENING_DURATION });
      }
    });
    // The reset button only shows once the view has left the opening one.
    map.on("moveend", () => {
      const c = map.getCenter();
      setAtHome(Math.abs(map.getZoom() - home.zoom) < 0.01
        && Math.abs(c.lng - home.center[0]) < 0.01
        && Math.abs(c.lat - home.center[1]) < 0.01);
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

  // Project points — re-filtered whenever the page filters change, each
  // carrying the colour and legend label of the current lens.
  const lens = LENSES[colourBy] || LENSES.sector;
  const byId = new Map(projects.map(p => [p.id, p]));
  const feats = (geojson?.features || [])
    .filter(f => byId.has(f.properties.id))
    .map(f => {
      const [label, color] = lens.of(byId.get(f.properties.id), f.properties);
      return { ...f, properties: { ...f.properties, lens_label: label, lens_color: color } };
    });
  const pointById = new Map(feats.map(f => [f.properties.id, f]));

  // Legend: the values present among the displayed points, in the point colour
  const rank = (label) => (lens.order ? lens.order.indexOf(label) : -1);
  const legend = [...new Map(feats.map(f => [f.properties.lens_label, f.properties.lens_color]))]
    .sort((a, b) => (lens.order ? rank(a[0]) - rank(b[0]) : a[0].localeCompare(b[0])));

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
        "circle-color": ["coalesce", ["get", "lens_color"], FALLBACK_COLOR],
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

    return () => {
      map.off("data", onData);
      map.off("moveend", syncClusters);
    };
  }, [mapReady, geojson, projects, colourBy]);

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
          <h5>{lens.title}</h5>
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
              colorOf={(id) => pointById.get(id)?.properties.lens_color}
              onPick={(id) => setSelected({ kind: "project", id, lngLat: selected.lngLat })}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}

      {!isLoading && !atHome && (
        <button type="button" className="pmap-reset" title="Back to the opening view"
          onClick={() => mapInst.current?.flyTo({ ...(compact ? HOME_VIEW_COMPACT : HOME_VIEW), duration: 900 })}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" />
          </svg>
          Reset view
        </button>
      )}

      <div className="pmap-attribution">{ATTRIBUTION}</div>
    </div>
  );
}

/**
 * ProjectMap — Carte géographique projet
 * Fond de carte partagé : mapStyle.js (tuiles Martin, Positron réduit).
 * Source : /api/projects/<pk>/geojson/ → PostGIS GADM
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { ATTRIBUTION, BASEMAP_STYLE, LABELS_LAYER_ID } from "./mapStyle.js";
import { colorExpression, layerScale } from "./layerColors.js";

// Les libellés des couches GIS viennent de fichiers téléversés : contenu non
// fiable, injecté ici dans du HTML de popup. On l'échappe.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

// Tuyauterie KML et clés internes : présentes dans les données, sans intérêt
// dans la fiche. Le reste des attributs vient du fichier et s'affiche tel quel.
const HIDDEN_PROPERTIES = new Set([
  "tessellate", "extrude", "visibility", "drawOrder", "altitudeMode",
  "begin", "end", "timestamp", "icon", "snippet",
]);

// Une valeur qui ressemble à du balisage n'est pas un attribut : c'est une
// fiche HTML que l'import n'a pas démontée (couche importée avant que
// converters.py ne le fasse, ou format inattendu). Elle est échappée de toute
// façon, mais l'afficher noierait la fiche sous une table illisible.
const LOOKS_LIKE_MARKUP = /<[a-z!/][^>]*>/i;

function attributeRows(properties) {
  return Object.entries(properties || {})
    .filter(([key, value]) =>
      !key.startsWith("_") &&
      !HIDDEN_PROPERTIES.has(key) &&
      value !== null && value !== "" && value !== undefined &&
      !(typeof value === "string" && LOOKS_LIKE_MARKUP.test(value)))
    .map(([key, value]) => [key, String(value)]);
}

// Une même source porte points, lignes et polygones : chaque couche filtre son
// type. Ces filtres sont la base sur laquelle la légende ajoute les siens, donc
// ils vivent ici plutôt qu'en ligne dans l'effet qui crée les couches.
const GEOMETRY_FILTER = {
  fill:  ["==", ["geometry-type"], "Polygon"],
  line:  ["any", ["==", ["geometry-type"], "Polygon"],
                 ["==", ["geometry-type"], "LineString"]],
  point: ["==", ["geometry-type"], "Point"],
};

// Les couches GADM que chaque entrée de légende commande.
const GADM_LAYERS = {
  "gadm:country": ["proj-country-fill", "proj-country-border"],
  "gadm:admin1":  ["proj-admin1-fill", "proj-admin1-line",
                   "proj-admin1-active-fill", "proj-admin1-active-line"],
  "gadm:admin2":  ["proj-admin2-fill", "proj-admin2-line"],
};

// Un bouton de légende doit ressembler à la ligne qu'il remplaçait : les
// styles du bouton natif sont neutralisés.
const LEGEND_BUTTON = {
  background: "none", border: "none", font: "inherit", textAlign: "left",
  cursor: "pointer", width: "100%",
};

/** Une ligne de légende qui allume et éteint sa couche. */
function LegendRow({ on, onToggle, dense = false, children }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      title={on ? "Hide this layer" : "Show this layer"}
      style={{
        ...LEGEND_BUTTON,
        display: "flex", alignItems: "center", gap: dense ? 6 : 7,
        marginBottom: dense ? 2 : 4, padding: "1px 0",
        // Éteinte : la ligne pâlit et son libellé se barre, pour qu'un coup
        // d'œil suffise à voir ce qui manque sur la carte.
        opacity: on ? 1 : 0.4,
        textDecoration: on ? "none" : "line-through",
      }}>
      {children}
    </button>
  );
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

export default function ProjectMap({ projectId, countries = [], height = 380 }) {
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
  // La fiche d'un point n'est PAS un popup MapLibre.
  //
  // Un popup reste accroché à sa coordonnée : MapLibre le repositionne à chaque
  // image d'un zoom, et rien ne peut l'en empêcher de l'extérieur — compenser
  // son déplacement image par image revient à courir derrière lui, avec une
  // image de retard, ce qui se voit. La fiche est donc un simple div, posé une
  // fois aux pixels du clic dans le cadre de la carte. Le zoom ne la touche
  // pas ; seule la poignée la déplace.
  const [sheet, setSheet] = useState(null);
  // Une fiche ouverte gagne sur l'infobulle de survol : sans cela les deux se
  // superposent.
  const sheetOpenRef = useRef(false);
  sheetOpenRef.current = !!sheet;

  // Glissement de la fiche par son en-tête ; le corps reste sélectionnable,
  // une fiche est faite pour être lue et recopiée.
  function onSheetPointerDown(event) {
    if (event.button !== 0) return;
    const startX = event.clientX - sheet.x;
    const startY = event.clientY - sheet.y;
    const node = event.currentTarget;
    const move = (e) => setSheet(s => s && { ...s, x: e.clientX - startX, y: e.clientY - startY });
    const up = (e) => {
      node.releasePointerCapture?.(e.pointerId);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
    node.setPointerCapture?.(event.pointerId);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    event.preventDefault();
  }
  const assetSignature = assetLayers
    .map(l => `${l.asset.id}:${l.asset.layer_color}:${l.geojson.features.length}`)
    .join("|");

  // Ce que la légende a éteint. C'est de l'état de vue, pas une préférence :
  // ce qui s'affiche à l'ouverture reste `is_visible_default`, côté serveur,
  // réglé depuis le registre sous la carte. Recharger revient à ce défaut.
  const [hidden, setHidden] = useState(() => new Set());
  const [openAsset, setOpenAsset] = useState(null);

  function toggle(key) {
    setHidden(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Le canevas MapLibre ne suit pas un changement de hauteur tout seul.
  useEffect(() => { mapInst.current?.resize(); }, [height]);

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
      if (sheetOpenRef.current) { map.getCanvas().style.cursor = ""; popup.remove(); return; }
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
            <div style="font-size:9px;color:#A7A7A7;margin-top:4px">Click for the full record</div>
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
    // Une infobulle de survol reste accrochée à sa coordonnée : pendant un
    // zoom elle glisserait sous le curseur. On la retire, le survol suivant la
    // ramènera.
    map.on("movestart", onMouseLeave);

    // Bbox
    if (features.length) {
      const bbox = getBbox(features);
      map.fitBounds(bbox, { padding: 24, maxZoom: 9, duration: 900 });
    }

    // Sans ce retrait, un handler s'ajoutait à chaque exécution de l'effet.
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseleave", onMouseLeave);
      map.off("movestart", onMouseLeave);
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
      // peint en tons d'une seule teinte, du plus foncé (le type le plus
      // nombreux) au plus clair ; sinon, la couleur de l'asset.
      const color = colorExpression(layerScale(data, asset.layer_color),
                                    asset.layer_color || "#0EB584");
      map.addSource(sourceId, { type: "geojson", data });

      // Un même fichier peut porter polygones, lignes et points à la fois :
      // trois couches filtrées par type plutôt qu'un pari sur la géométrie.
      map.addLayer({ id: `${sourceId}-fill`, type: "fill", source: sourceId,
        filter: GEOMETRY_FILTER.fill,
        paint: { "fill-color": color, "fill-opacity": 0.25 } }, LABELS_LAYER_ID);
      map.addLayer({ id: `${sourceId}-line`, type: "line", source: sourceId,
        filter: GEOMETRY_FILTER.line,
        paint: { "line-color": color, "line-width": 2, "line-opacity": 0.95 } }, LABELS_LAYER_ID);
      map.addLayer({ id: `${sourceId}-point`, type: "circle", source: sourceId,
        filter: GEOMETRY_FILTER.point,
        paint: { "circle-radius": 5, "circle-color": color,
                 "circle-stroke-width": 1.5, "circle-stroke-color": "#FFFFFF" } }, LABELS_LAYER_ID);
    });

    // Fiche au clic — comme la bulle de Google Earth sur une chinchette.
    function assetLayerIds() {
      return assetLayersRef.current
        .flatMap(({ asset }) => [`gis-asset-${asset.id}-point`,
                                 `gis-asset-${asset.id}-line`,
                                 `gis-asset-${asset.id}-fill`])
        .filter(id => map.getLayer(id));
    }

    function onClick(e) {
      const ids = assetLayerIds();
      if (!ids.length) return;
      const feats = map.queryRenderedFeatures(e.point, { layers: ids });
      if (!feats.length) { setSheet(null); return; }

      const p = feats[0].properties || {};
      // La fiche est posée une fois, aux pixels du clic, et n'est plus jamais
      // repositionnée : c'est ce qui la tient immobile pendant un zoom.
      setSheet({
        x: e.point.x,
        y: e.point.y,
        title: p._label || "—",
        kind: p._layer || "",
        rows: attributeRows(p),
      });
    }

    map.on("click", onClick);

    // Le cadrage initial appartient au périmètre GADM ; on ne s'en saisit que
    // s'il n'y a aucune géométrie GADM à cadrer.
    if (!geojson?.features?.length && assetLayersRef.current.length) {
      const all = assetLayersRef.current.flatMap(l => l.geojson.features);
      if (all.length) map.fitBounds(getBbox(all), { padding: 24, maxZoom: 12, duration: 900 });
    }

    return () => { map.off("click", onClick); };
  }, [mapReady, assetSignature, geojson]);

  // Visibilité commandée par la légende. Effet séparé de ceux qui construisent
  // les couches : éteindre une entrée ne doit pas reconstruire une source de
  // vingt mille points.
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    const show = (id, visible) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    };

    Object.entries(GADM_LAYERS).forEach(([key, ids]) => {
      ids.forEach(id => show(id, !hidden.has(key)));
    });

    // Les pays partagent une seule couche : on les éteint par filtre sur iso2,
    // pas par visibilité.
    const hiddenCountries = countries
      .map(c => c.iso2)
      .filter(iso2 => hidden.has(`country:${iso2}`));
    ["proj-country-fill", "proj-country-border"].forEach(id => {
      if (!map.getLayer(id)) return;
      map.setFilter(id, hiddenCountries.length
        ? ["!", ["in", ["get", "iso2"], ["literal", hiddenCountries]]]
        : null);
    });

    assetLayersRef.current.forEach(({ asset }) => {
      const assetHidden = hidden.has(`asset:${asset.id}`);
      const prefix = `type:${asset.id}:`;
      const hiddenTypes = [...hidden]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length));

      ["fill", "line", "point"].forEach(kind => {
        const id = `gis-asset-${asset.id}-${kind}`;
        if (!map.getLayer(id)) return;
        show(id, !assetHidden);
        map.setFilter(id, hiddenTypes.length
          ? ["all", GEOMETRY_FILTER[kind],
                    ["!", ["in", ["get", "_layer"], ["literal", hiddenTypes]]]]
          : GEOMETRY_FILTER[kind]);
      });
    });
  }, [mapReady, hidden, assetSignature, geojson, countries]);

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

      {/* Fiche d'un point — div ordinaire, posé une fois. Voir setSheet. */}
      {sheet && (
        <div style={{
          position: "absolute", zIndex: 11,
          left: sheet.x, top: sheet.y,
          transform: "translate(-50%, -100%) translateY(-14px)",
          width: 280, maxWidth: "calc(100% - 24px)",
          background: "#FFFFFF", borderRadius: 10,
          border: "1px solid #ECEBE8",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          fontFamily: "-apple-system, sans-serif",
        }}>
          <div className="arbm-popup-handle" onPointerDown={onSheetPointerDown}
            style={{ padding: "10px 12px 8px", borderBottom: "1px solid #ECEBE8",
              position: "relative" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#2B2B2B", paddingRight: 18 }}>
              {sheet.title}
            </div>
            {sheet.kind && (
              <div style={{ fontSize: 10, fontWeight: 600, color: "#545454", marginTop: 2,
                textTransform: "uppercase", letterSpacing: ".06em" }}>
                {sheet.kind}
              </div>
            )}
            <button type="button" onClick={() => setSheet(null)} aria-label="Close"
              style={{ position: "absolute", top: 6, right: 8, background: "none",
                border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1,
                color: "#A7A7A7", padding: 2 }}>×</button>
          </div>
          <div style={{ padding: "8px 12px 10px", maxHeight: 240, overflow: "auto" }}>
            {sheet.rows.length ? (
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr",
                gap: "2px 10px", margin: 0, fontSize: 11 }}>
                {sheet.rows.map(([key, value]) => (
                  <Fragment key={key}>
                    <dt style={{ color: "#A7A7A7", whiteSpace: "nowrap" }}>
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd style={{ margin: 0, color: "#2B2B2B", wordBreak: "break-word" }}>
                      {value}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <div style={{ fontSize: 11, color: "#A7A7A7" }}>No attributes recorded.</div>
            )}
          </div>
        </div>
      )}

      {/* Légende */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        background: "rgba(255,255,255,0.95)", borderRadius: 10,
        padding: "10px 14px", fontSize: 11,
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(0,0,0,0.06)",
        minWidth: 150, maxWidth: 240,
        // Déplier les types d'un fichier peut faire trente entrées : la boîte
        // défile plutôt que de recouvrir la carte.
        maxHeight: "calc(100% - 24px)", overflowY: "auto",
      }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#545454",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
          Geographic scope
        </div>
        <div style={{ fontSize: 9, color: "#A7A7A7", marginBottom: 8 }}>
          Click an entry to show or hide it
        </div>
        {countries.map(c => (
          <LegendRow key={c.iso2} on={!hidden.has(`country:${c.iso2}`)}
            onToggle={() => toggle(`country:${c.iso2}`)}>
            <span style={{ width: 12, height: 12, borderRadius: 3,
              background: "#0EB584", border: "1.5px solid #09815F", flexShrink: 0 }} />
            <span style={{ color: "#545454", fontSize: 12 }}>{c.flag} {c.name}</span>
            {c.is_lead && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#09815F",
                background: "#EFFFFA", padding: "1px 5px", borderRadius: 99 }}>LEAD</span>
            )}
          </LegendRow>
        ))}
        {scopeCount > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #ECEBE8" }}>
            <LegendRow on={!hidden.has("gadm:admin2")} onToggle={() => toggle("gadm:admin2")}>
              <span style={{ width: 12, height: 12, borderRadius: 3,
                background: "#0089C5", border: "1.5px solid #0089C5", flexShrink: 0 }} />
              <span style={{ color: "#545454", fontSize: 11 }}>
                {scopeCount} intervention zone{scopeCount > 1 ? "s" : ""}
              </span>
            </LegendRow>
          </div>
        )}
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #ECEBE8" }}>
          <LegendRow on={!hidden.has("gadm:admin1")} onToggle={() => toggle("gadm:admin1")}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#09815F" strokeWidth="1.5" strokeDasharray="4,2"/></svg>
            <span style={{ fontSize: 10, color: "#A7A7A7" }}>Admin 1 (region)</span>
          </LegendRow>
          <LegendRow on={!hidden.has("gadm:admin2")} onToggle={() => toggle("gadm:admin2")}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"
              stroke="#0089C5" strokeWidth="1.5"/></svg>
            <span style={{ fontSize: 10, color: "#A7A7A7" }}>Admin 2 (district)</span>
          </LegendRow>
        </div>
        {assetLayers.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #ECEBE8" }}>
            <div style={{ fontWeight: 700, fontSize: 10, color: "#A7A7A7",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
              GIS layers
            </div>
            {assetLayers.map(({ asset, geojson: data }) => {
              const scale = layerScale(data, asset.layer_color);
              const assetOn = !hidden.has(`asset:${asset.id}`);
              const isOpen  = openAsset === asset.id;
              return (
                <div key={asset.id}>
                  <LegendRow on={assetOn} onToggle={() => toggle(`asset:${asset.id}`)}>
                    {/* Une barre de la rampe, pas une pastille : elle dit que la
                        couche est peinte en tons, du plus nombreux au moins. */}
                    <span style={{ display: "flex", flexShrink: 0, borderRadius: 3, overflow: "hidden",
                      width: 12, height: 12, border: "1px solid rgba(0,0,0,0.10)" }}>
                      {(scale.names.length
                        ? scale.names.filter((_, i, all) =>
                            i % Math.max(1, Math.ceil(all.length / 4)) === 0).slice(0, 4)
                        : [null]
                      ).map((name, i) => (
                        <span key={name ?? i} style={{ flex: 1,
                          background: name ? scale.color.get(name) : asset.layer_color }} />
                      ))}
                    </span>
                    <span style={{ color: "#545454", fontSize: 11 }}>{asset.name}</span>
                  </LegendRow>
                  {scale.names.length > 1 && (
                    <button type="button"
                      onClick={() => setOpenAsset(isOpen ? null : asset.id)}
                      title={isOpen ? "Hide the types" : "Show each type"}
                      style={{ ...LEGEND_BUTTON, marginLeft: 19, padding: "1px 0",
                        fontSize: 9, color: "#A7A7A7" }}>
                      {scale.names.length} types {isOpen ? "▴" : "▾"}
                    </button>
                  )}
                  {isOpen && (
                    <div style={{ marginLeft: 19 }}>
                      {scale.names.map(name => (
                        <LegendRow key={name} dense
                          on={assetOn && !hidden.has(`type:${asset.id}:${name}`)}
                          onToggle={() => toggle(`type:${asset.id}:${name}`)}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                            background: scale.color.get(name) }} />
                          <span style={{ fontSize: 10, color: "#545454", whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                          <span style={{ fontSize: 9, color: "#A7A7A7", marginLeft: "auto" }}>
                            {scale.counts.get(name)}
                          </span>
                        </LegendRow>
                      ))}
                    </div>
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

      <div ref={mapRef} style={{ height, width: "100%" }} />

      {/* Attribution */}
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9,
        color: "#A7A7A7", zIndex: 5, background: "rgba(255,255,255,0.7)",
        padding: "2px 6px", borderRadius: 4 }}>
        {ATTRIBUTION}
      </div>
    </div>
  );
}

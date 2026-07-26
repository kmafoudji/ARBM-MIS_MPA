/**
 * ProjectMap — Carte géographique du projet
 * Affiche les pays du projet sur une carte MapLibre GL
 * Géométries : Natural Earth via CDN (pas de géométries en base)
 */
import { useEffect, useRef, useState } from "react";

// Mapping iso2 → iso3 pour Natural Earth
const ISO2_TO_ISO3 = {
  AF:"AFG",AL:"ALB",DZ:"DZA",AO:"AGO",AR:"ARG",AM:"ARM",AU:"AUS",AT:"AUT",
  AZ:"AZE",BD:"BGD",BE:"BEL",BJ:"BEN",BO:"BOL",BA:"BIH",BW:"BWA",BR:"BRA",
  BF:"BFA",BI:"BDI",KH:"KHM",CM:"CMR",CA:"CAN",CF:"CAF",TD:"TCD",CL:"CHL",
  CN:"CHN",CO:"COL",KM:"COM",CG:"COG",CD:"COD",CR:"CRI",CI:"CIV",HR:"HRV",
  CU:"CUB",CY:"CYP",CZ:"CZE",DK:"DNK",DJ:"DJI",DO:"DOM",EC:"ECU",EG:"EGY",
  SV:"SLV",GQ:"GNQ",ER:"ERI",EE:"EST",ET:"ETH",FJ:"FJI",FI:"FIN",FR:"FRA",
  GA:"GAB",GM:"GMB",GE:"GEO",DE:"DEU",GH:"GHA",GR:"GRC",GT:"GTM",GN:"GIN",
  GW:"GNB",GY:"GUY",HT:"HTI",HN:"HND",HU:"HUN",IN:"IND",ID:"IDN",IR:"IRN",
  IQ:"IRQ",IE:"IRL",IL:"ISR",IT:"ITA",JM:"JAM",JP:"JPN",JO:"JOR",KZ:"KAZ",
  KE:"KEN",KP:"PRK",KR:"KOR",KW:"KWT",KG:"KGZ",LA:"LAO",LV:"LVA",LB:"LBN",
  LS:"LSO",LR:"LBR",LY:"LBY",LT:"LTU",LU:"LUX",MG:"MDG",MW:"MWI",MY:"MYS",
  MV:"MDV",ML:"MLI",MT:"MLT",MR:"MRT",MX:"MEX",MD:"MDA",MN:"MNG",ME:"MNE",
  MA:"MAR",MZ:"MOZ",MM:"MMR",NA:"NAM",NP:"NPL",NL:"NLD",NZ:"NZL",NI:"NIC",
  NE:"NER",NG:"NGA",MK:"MKD",NO:"NOR",OM:"OMN",PK:"PAK",PA:"PAN",PG:"PNG",
  PY:"PRY",PE:"PER",PH:"PHL",PL:"POL",PT:"PRT",QA:"QAT",RO:"ROU",RU:"RUS",
  RW:"RWA",SA:"SAU",SN:"SEN",RS:"SRB",SL:"SLE",SO:"SOM",ZA:"ZAF",SS:"SSD",
  ES:"ESP",LK:"LKA",SD:"SDN",SR:"SUR",SZ:"SWZ",SE:"SWE",CH:"CHE",SY:"SYR",
  TW:"TWN",TJ:"TJK",TZ:"TZA",TH:"THA",TL:"TLS",TG:"TGO",TN:"TUN",TR:"TUR",
  TM:"TKM",UG:"UGA",UA:"UKR",AE:"ARE",GB:"GBR",US:"USA",UY:"URY",UZ:"UZB",
  VE:"VEN",VN:"VNM",YE:"YEM",ZM:"ZMB",ZW:"ZWE",
};

function getBbox(features) {
  if (!features.length) return null;
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  features.forEach(f => {
    const coords = f.geometry?.coordinates;
    if (!coords) return;
    function process(c) {
      if (typeof c[0] === "number") {
        minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
        minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
      } else c.forEach(process);
    }
    process(coords);
  });
  return [[minLng - 2, minLat - 2], [maxLng + 2, maxLat + 2]];
}

export default function ProjectMap({ countries = [], zones = [] }) {
  const mapRef    = useRef(null);
  const mapInst   = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const iso3s = countries
    .map(c => c.iso2 ? ISO2_TO_ISO3[c.iso2.toUpperCase()] : c.iso3)
    .filter(Boolean);

  useEffect(() => {
    if (!mapRef.current || !iso3s.length) return;

    let map;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      import("maplibre-gl/dist/maplibre-gl.css").catch(() => {});

      map = new maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            "osm-tiles": {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm-tiles", minzoom: 0, maxzoom: 19 }],
        },
        center: [0, 20],
        zoom: 2,
        attributionControl: false,
      });

      mapInst.current = map;

      map.on("load", async () => {
        try {
          // Charger GeoJSON Natural Earth
          const res = await fetch(
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
          );
          const geojson = await res.json();

          // Filtrer les pays du projet
          const projectFeatures = geojson.features.filter(f =>
            iso3s.includes(f.properties.ADM0_ISO || f.properties.ISO_A3 || f.properties.ISO_A3_EH)
          );

          // Ajouter source complète (monde en gris)
          map.addSource("world", { type: "geojson", data: geojson });
          map.addLayer({
            id: "world-fill",
            type: "fill",
            source: "world",
            paint: { "fill-color": "#e8ede8", "fill-opacity": 0.6 },
          });
          map.addLayer({
            id: "world-border",
            type: "line",
            source: "world",
            paint: { "line-color": "#ccc", "line-width": 0.5 },
          });

          // Ajouter les pays du projet en lime
          map.addSource("project-countries", {
            type: "geojson",
            data: { type: "FeatureCollection", features: projectFeatures },
          });
          map.addLayer({
            id: "project-fill",
            type: "fill",
            source: "project-countries",
            paint: { "fill-color": "#A4C53F", "fill-opacity": 0.6 },
          });
          map.addLayer({
            id: "project-border",
            type: "line",
            source: "project-countries",
            paint: { "line-color": "#7a9420", "line-width": 2 },
          });

          // Tooltip au hover
          const popup = new maplibregl.Popup({
            closeButton: false, closeOnClick: false,
            offset: 10,
          });
          map.on("mousemove", "project-fill", (e) => {
            map.getCanvas().style.cursor = "pointer";
            const name = e.features[0]?.properties?.NAME || e.features[0]?.properties?.ADMIN || "";
            popup.setLngLat(e.lngLat).setHTML(
              `<div style="font-size:12px;font-weight:600;padding:4px 8px;">${name}</div>`
            ).addTo(map);
          });
          map.on("mouseleave", "project-fill", () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });

          // Fitter sur les pays du projet
          if (projectFeatures.length > 0) {
            const bbox = getBbox(projectFeatures);
            if (bbox) {
              map.fitBounds(bbox, { padding: 40, maxZoom: 8, duration: 800 });
            }
          }

          setLoading(false);
        } catch (err) {
          console.error("Map error:", err);
          setError("Could not load map data.");
          setLoading(false);
        }
      });

      map.on("error", () => setError("Map failed to load."));
    }).catch(() => setError("MapLibre not available."));

    return () => { map?.remove(); mapInst.current = null; };
  }, [iso3s.join(",")]);

  if (!iso3s.length) return null;

  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: 16 }}>
      {/* Legend */}
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: "rgba(255,255,255,0.92)", borderRadius: 8, padding: "8px 12px",
        fontSize: 11, boxShadow: "0 2px 8px #0001",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: "#A4C53F", display: "inline-block" }} />
          <span style={{ fontWeight: 600, color: "#374151" }}>Project countries</span>
        </div>
        {countries.map(c => (
          <div key={c.iso2} style={{ fontSize: 11, color: "#6b7280", paddingLeft: 20 }}>
            {c.flag} {c.name}{c.is_lead ? " ★" : ""}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "#9ca3af",
        }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading map…
        </div>
      )}

      {error && (
        <div style={{
          padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      <div ref={mapRef} style={{ height: 320, width: "100%" }} />
    </div>
  );
}

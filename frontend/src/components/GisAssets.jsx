/**
 * GisAssets — M5
 * Registre des couches GIS téléversées d'un projet : import, validation
 * côté serveur, et liste dense des couches.
 *
 * Ce panneau ne monte pas la carte : l'onglet Geographic Scope la monte une
 * seule fois, au-dessus, et ProjectMap va chercher les couches lui-même.
 *
 * Les couches sont une superposition : elles ne modifient pas le périmètre
 * GADM (SF-7), qui reste la source du périmètre géographique du projet.
 */
import { useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "../api";
import { useDialog, DialogModal } from "./Dialog.jsx";
import Icon from "./Icon.jsx";
import { layerColor, layerCounts, layerNames } from "./layerColors.js";

// Ce que le serveur sait lire (apps/spatial/converters.py). L'attribut accept
// n'est qu'un confort : la validation se fait sur le contenu, pas l'extension.
const ACCEPT = ".geojson,.json,.kml,.kmz,.gpx,.gpkg,.zip";

const FORMAT_LABELS = {
  geojson: "GeoJSON", kml: "KML", kmz: "KMZ",
  gpx: "GPX", gpkg: "GeoPackage", shp_zip: "Shapefile",
};

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function GisAssets({ projectId, canEdit = true }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const dialog = useDialog();

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [expanded, setExpanded] = useState(null);

  const qKey = ["gis-assets", projectId];
  const { data, isLoading, isError } = useQuery({
    queryKey: qKey,
    queryFn:  () => apiFetch(`/api/projects/${projectId}/gis-assets/`),
    enabled:  !!projectId,
    staleTime: 60_000,
  });

  const assets = data?.results || [];

  // Mêmes clés que ProjectMap : react-query sert le cache, aucune requête en
  // plus. Seules les couches visibles sont chargées — la carte ne demande pas
  // les autres non plus.
  const geojsonQueries = useQueries({
    queries: assets.filter(a => a.is_visible_default).map(a => ({
      queryKey: ["gis-asset-geojson", a.id],
      queryFn:  () => apiFetch(`/api/projects/${projectId}/gis-assets/${a.id}/geojson/`),
      staleTime: 5 * 60_000,
    })),
  });

  const geojsonById = new Map();
  assets.filter(a => a.is_visible_default).forEach((a, i) => {
    if (geojsonQueries[i]?.data) geojsonById.set(a.id, geojsonQueries[i].data);
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: qKey });
  }

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", form.name);
      fd.append("description", form.description);
      // apiUpload laisse le navigateur fixer la boundary multipart.
      return apiUpload(`/api/projects/${projectId}/gis-assets/`, fd);
    },
    onSuccess: () => { refresh(); closeForm(); },
  });

  const patchMutation = useMutation({
    mutationFn: ({ assetId, payload }) => apiFetch(
      `/api/projects/${projectId}/gis-assets/${assetId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId) => apiFetch(
      `/api/projects/${projectId}/gis-assets/${assetId}/`, { method: "DELETE" },
    ),
    onSuccess: refresh,
  });

  function closeForm() {
    setAdding(false);
    setFile(null);
    setForm({ name: "", description: "" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(asset) {
    const ok = await dialog.confirm(
      `Remove the layer “${asset.name}” from this project?`,
      { title: "Remove GIS layer", confirmLabel: "Remove", danger: true },
    );
    if (ok) deleteMutation.mutate(asset.id);
  }

  return (
    <div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <div>
            <div className="card-title" style={{ fontSize: 13 }}>
              <Icon name="layers" size={13} style={{ marginRight: 6, color: "var(--lime)" }} />
              GIS layers
              {assets.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 10, background: "var(--lime-pale)",
                  color: "var(--lime-darker)", padding: "1px 7px", borderRadius: 99 }}>
                  {assets.length}
                </span>
              )}
            </div>
            <div className="card-sub" style={{ fontSize: 11 }}>
              GeoJSON · KML · KMZ · GPX · GeoPackage · zipped shapefile, 10 MB max.
              Overlay only — the scope stays with SF-7.
            </div>
          </div>
          {canEdit && !adding && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={() => setAdding(true)}>
              <Icon name="plus" size={12} /> Add layer
            </button>
          )}
        </div>

        <div className="card-body" style={{ paddingTop: 4 }}>
          {isLoading && <span className="spinner" />}
          {isError && (
            <p style={{ fontSize: 12, color: "var(--rose)", margin: 0 }}>
              Could not load the GIS layers.
            </p>
          )}
          {!isLoading && !isError && assets.length === 0 && !adding && (
            <p style={{ fontSize: 12, color: "var(--subtle)", margin: 0, fontStyle: "italic" }}>
              No GIS layer uploaded yet.
            </p>
          )}

          {assets.map((asset, rowIndex) => {
            const geojson = geojsonById.get(asset.id);
            const names   = layerNames(geojson);
            const counts  = layerCounts(geojson);
            const isOpen  = expanded === asset.id;

            return (
              <div key={asset.id} style={{
                borderTop: rowIndex === 0 ? "none" : "1px solid var(--rule)",
                padding: "7px 0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {/* Ruban : les couleurs réellement peintes, pas une pastille
                      unique qui mentirait sur un fichier à 31 sous-couches. */}
                  <span style={{ display: "flex", flexShrink: 0, borderRadius: 3,
                    overflow: "hidden", width: 14, height: 14,
                    border: "1px solid var(--rule)",
                    opacity: asset.is_visible_default ? 1 : 0.35 }}>
                    {(names.length ? names.slice(0, 4) : [null]).map((name, i) => (
                      <span key={name ?? i} style={{ flex: 1,
                        background: names.length ? layerColor(i) : asset.layer_color }} />
                    ))}
                  </span>

                  <span style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asset.name}
                  </span>

                  <span style={{ fontSize: 10, fontWeight: 600, padding: "0 6px",
                    borderRadius: 99, background: "var(--surface-2, var(--paper))",
                    color: "var(--muted)", flexShrink: 0 }}>
                    {FORMAT_LABELS[asset.source_format] || asset.source_format}
                  </span>

                  <span style={{ fontSize: 10, color: "var(--subtle)", flexShrink: 0 }}>
                    {asset.feature_count} pt{asset.feature_count === 1 ? "" : "s"}
                    {names.length > 1 && ` · ${names.length} types`}
                    {` · ${formatSize(asset.original_size_bytes)}`}
                  </span>

                  <span style={{ flex: 1 }} />

                  {names.length > 1 && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", fontSize: 10 }}
                      title={isOpen ? "Hide the types" : "Show the types"}
                      onClick={() => setExpanded(isOpen ? null : asset.id)}>
                      <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={12} />
                    </button>
                  )}
                  {asset.download_url && (
                    <a href={asset.download_url} title={asset.original_filename}
                      style={{ fontSize: 10, color: "var(--blue)", display: "flex",
                        alignItems: "center", flexShrink: 0 }}>
                      <Icon name="download" size={12} />
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <input type="color" value={asset.layer_color} title="Layer colour"
                        onChange={e => patchMutation.mutate({
                          assetId: asset.id, payload: { layer_color: e.target.value },
                        })}
                        style={{ width: 18, height: 18, padding: 0, border: "1px solid var(--rule)",
                          borderRadius: 4, background: "none", cursor: "pointer", flexShrink: 0 }} />
                      <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }}
                        title={asset.is_visible_default ? "Hide on the map" : "Show on the map"}
                        onClick={() => patchMutation.mutate({
                          assetId: asset.id,
                          payload: { is_visible_default: !asset.is_visible_default },
                        })}>
                        <Icon name={asset.is_visible_default ? "check-circle" : "circle-x"} size={12} />
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", color: "var(--rose)" }}
                        title="Remove layer" onClick={() => remove(asset)}>
                        <Icon name="trash" size={11} />
                      </button>
                    </>
                  )}
                </div>

                {asset.description && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginLeft: 23, marginTop: 2 }}>
                    {asset.description}
                  </div>
                )}

                {isOpen && (
                  <div style={{ marginLeft: 23, marginTop: 6, display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "2px 12px" }}>
                    {names.map((name, i) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                          background: layerColor(i) }} />
                        <span style={{ fontSize: 11, color: "var(--ink-soft, var(--ink))",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--subtle)", flexShrink: 0 }}>
                          {counts.get(name)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {adding && (
            <div style={{ background: "var(--lime-pale)", border: "1px solid var(--lime)",
              borderRadius: 10, padding: 14, marginTop: 10 }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">File *</label>
                <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: "none" }}
                  onChange={e => {
                    const chosen = e.target.files[0];
                    setFile(chosen || null);
                    // Le nom du fichier fait un titre par défaut acceptable.
                    if (chosen && !form.name.trim()) {
                      setForm(f => ({ ...f, name: chosen.name.replace(/\.[^.]+$/, "") }));
                    }
                  }} />
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }}
                  onClick={() => fileRef.current.click()}>
                  <Icon name="upload" size={13} /> {file ? file.name : "Choose file…"}
                </button>
                <div className="field-help">
                  The format is checked on the file content, not on its extension.
                  A KML folder becomes a type, drawn in its own colour.
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: 10, marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Layer name</label>
                  <input className="field-input" placeholder="Intervention sites…"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Description</label>
                  <input className="field-input" placeholder="Source, date, anything worth recording…"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              {uploadMutation.isError && (
                <div className="field-error" style={{ marginBottom: 8 }}>
                  {uploadMutation.error?.detail?.detail || "Could not import the layer."}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
                <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !file}>
                  <Icon name="check" size={12} />
                  {uploadMutation.isPending ? "Importing…" : "Import layer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogModal {...dialog.dialogProps} />
    </div>
  );
}

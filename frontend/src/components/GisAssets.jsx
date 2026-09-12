/**
 * GisAssets — M5
 * Registre des couches GIS téléversées d'un projet : import, validation
 * côté serveur, et rendu sur la carte du projet.
 *
 * Les couches sont une superposition : elles ne modifient pas le périmètre
 * GADM (SF-7), qui reste la source du périmètre géographique du projet.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "../api";
import { useDialog, DialogModal } from "./Dialog.jsx";
import Icon from "./Icon.jsx";
import ProjectMap from "./ProjectMap.jsx";

// Ce que le serveur sait lire (apps/spatial/converters.py). L'attribut accept
// n'est qu'un confort : la validation se fait sur le contenu, pas l'extension.
const ACCEPT = ".geojson,.json,.kml,.kmz,.gpx,.gpkg,.zip";

const FORMAT_LABELS = {
  geojson: "GeoJSON", kml: "KML", kmz: "KMZ",
  gpx: "GPX", gpkg: "GeoPackage", shp_zip: "Shapefile",
};

const GEOMETRY_ICONS = {
  Point: "map-pin", MultiPoint: "map-pin",
  LineString: "git-branch", MultiLineString: "git-branch",
  Polygon: "layers", MultiPolygon: "layers",
};

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function GisAssets({ projectId, countries = [], canEdit = true }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const dialog = useDialog();

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const qKey = ["gis-assets", projectId];
  const { data, isLoading, isError } = useQuery({
    queryKey: qKey,
    queryFn:  () => apiFetch(`/api/projects/${projectId}/gis-assets/`),
    enabled:  !!projectId,
    staleTime: 60_000,
  });

  const assets = data?.results || [];

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
    onSuccess: () => {
      refresh();
      closeForm();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ assetId, payload }) => apiFetch(
      `/api/projects/${projectId}/gis-assets/${assetId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
    onSuccess: (_data, { assetId }) => {
      refresh();
      // La géométrie n'a pas bougé, mais la couleur et la visibilité pilotent
      // le rendu : la carte doit relire la liste.
      qc.invalidateQueries({ queryKey: ["gis-asset-geojson", assetId] });
    },
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
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Icon name="layers" size={14} style={{ marginRight: 6, color: "var(--lime)" }} />
              GIS layers
            </div>
            <div className="card-sub">
              GeoJSON · KML · KMZ · GPX · GeoPackage · zipped shapefile — 10 MB max.
              Drawn over the project map; the geographic scope stays with SF-7.
            </div>
          </div>
          {canEdit && !adding && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={() => setAdding(true)}>
              <Icon name="plus" size={12} /> Add layer
            </button>
          )}
        </div>

        <div className="card-body">
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

          {assets.map(asset => (
            <div key={asset.id} style={{
              background: "var(--paper)", border: "1px solid var(--rule)",
              borderRadius: 8, padding: "10px 12px", marginBottom: 8,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <input
                type="color"
                value={asset.layer_color}
                disabled={!canEdit}
                title="Layer colour"
                onChange={e => patchMutation.mutate({
                  assetId: asset.id, payload: { layer_color: e.target.value },
                })}
                style={{ width: 24, height: 24, padding: 0, border: "1px solid var(--rule)",
                  borderRadius: 6, background: "none", cursor: canEdit ? "pointer" : "default",
                  flexShrink: 0, marginTop: 1 }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>
                  {asset.name}
                </div>
                {asset.description && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {asset.description}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center",
                  marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px",
                    borderRadius: 99, background: "var(--lime-pale)", color: "var(--lime-darker)" }}>
                    {FORMAT_LABELS[asset.source_format] || asset.source_format}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--subtle)" }}>
                    {asset.feature_count} feature{asset.feature_count === 1 ? "" : "s"}
                  </span>
                  {(asset.geometry_types || []).map(type => (
                    <span key={type} style={{ fontSize: 10, color: "var(--subtle)",
                      display: "flex", alignItems: "center", gap: 3 }}>
                      <Icon name={GEOMETRY_ICONS[type] || "layers"} size={10} /> {type}
                    </span>
                  ))}
                  <span style={{ fontSize: 10, color: "var(--subtle)" }}>
                    {formatSize(asset.original_size_bytes)}
                  </span>
                  {asset.uploaded_by_name && (
                    <span style={{ fontSize: 10, color: "var(--subtle)" }}>
                      by {asset.uploaded_by_name}
                    </span>
                  )}
                  {asset.download_url && (
                    <a href={asset.download_url}
                      style={{ fontSize: 10, color: "var(--blue)", display: "flex",
                        alignItems: "center", gap: 3 }}>
                      <Icon name="download" size={10} /> {asset.original_filename}
                    </a>
                  )}
                </div>
              </div>

              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm row" style={{ gap: 4, fontSize: 11 }}
                    title={asset.is_visible_default ? "Hide on the map" : "Show on the map"}
                    onClick={() => patchMutation.mutate({
                      assetId: asset.id,
                      payload: { is_visible_default: !asset.is_visible_default },
                    })}>
                    <Icon name={asset.is_visible_default ? "check-circle" : "circle-x"} size={12} />
                    {asset.is_visible_default ? "Shown" : "Hidden"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--rose)" }}
                    title="Remove layer" onClick={() => remove(asset)}>
                    <Icon name="trash" size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {adding && (
            <div style={{ background: "var(--lime-pale)", border: "1px solid var(--lime)",
              borderRadius: 10, padding: 14, marginTop: 8 }}>
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
                </div>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">Layer name</label>
                <input className="field-input" placeholder="Intervention sites…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field-label">Description</label>
                <input className="field-input" placeholder="Source, date, anything worth recording…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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

      <div style={{ marginTop: 20 }}>
        <ProjectMap projectId={projectId} countries={countries} />
      </div>

      <DialogModal {...dialog.dialogProps} />
    </div>
  );
}

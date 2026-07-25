/**
 * SF-7 — Périmètre géographique GADM
 * Sélection hiérarchique Admin 1 → Admin 2 pour un projet.
 * Affichage : tableau des zones sélectionnées + sélecteur à deux niveaux.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";
import Icon from "./Icon.jsx";

export default function GeographicScope({ projectId, countries, canEdit }) {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState(null); // area id en cours d'édition
  const [editForm, setEditForm]   = useState({ is_primary: false, notes: "" });
  const [selAdmin1, setSelAdmin1] = useState("");
  const [selAdmin2, setSelAdmin2] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes]         = useState("");

  // Pays du projet (pour filtrer les zones GADM)
  const projectCountryIso3s = (countries || []).map((c) => c.iso3).filter(Boolean);
  const firstIso3 = projectCountryIso3s[0] || "";
  const [selectedCountryIso3, setSelectedCountryIso3] = useState(firstIso3);

  // Zones déjà dans le périmètre
  const { data: scope = [], isLoading } = useQuery({
    queryKey: ["gadm-scope", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/gadm-scope/`),
    staleTime: 30_000,
  });

  // Admin 1 du pays sélectionné
  const { data: admin1List = [] } = useQuery({
    queryKey: ["gadm", selectedCountryIso3, 1],
    queryFn: () => apiFetch(`/api/reference/gadm/?country=${selectedCountryIso3}&level=1`),
    enabled: !!selectedCountryIso3,
    staleTime: 300_000,
  });

  // Admin 2 du admin1 sélectionné
  const { data: admin2List = [] } = useQuery({
    queryKey: ["gadm", "children", selAdmin1],
    queryFn: () => apiFetch(`/api/reference/gadm/?parent=${selAdmin1}&level=2`),
    enabled: !!selAdmin1,
    staleTime: 300_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/`, {
        method: "POST", body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] });
      setSelAdmin1(""); setSelAdmin2(""); setIsPrimary(false); setNotes("");
      setShowForm(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (areaId) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }),
  });

  const editMutation = useMutation({
    mutationFn: ({ areaId, payload }) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, {
        method: "PATCH", body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] });
      setEditId(null);
    },
  });

  function openEdit(s) {
    setEditId(s.area);
    setEditForm({ is_primary: s.is_primary, notes: s.notes || "" });
    setShowForm(false);
  }

  const primaryMutation = useMutation({
    mutationFn: ({ areaId, value }) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, {
        method: "PATCH", body: JSON.stringify({ is_primary: value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }),
  });

  function handleAdd() {
    const areaId = selAdmin2 || selAdmin1;
    if (!areaId) return;
    addMutation.mutate({ area: Number(areaId), is_primary: isPrimary, notes });
  }

  const hasAdmin2 = admin2List.length > 0;
  const scopedAreaIds = new Set(scope.map((s) => s.area));

  if (isLoading) return <div className="card-body"><span className="spinner" /> Loading…</div>;

  return (
    <div className="card-body">
      {/* Table des zones */}
      {scope.length > 0 && (
        <table className="data-table mb-3" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Area</th>
              <th style={{ textAlign: "left" }}>Level</th>
              <th style={{ textAlign: "left" }}>Parent (Admin 1)</th>
              <th style={{ width: 90 }}>Primary</th>
              {canEdit && <th style={{ width: 200 }}></th>}
            </tr>
          </thead>
          <tbody>
            {scope.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.area_name}</strong></td>
                <td>
                  <span className="badge">
                    {s.area_level === 1 ? "Admin 1" : "Admin 2"}
                  </span>
                </td>
                <td className="text-muted text-sm">{s.parent_name || "—"}</td>
                <td style={{ textAlign: "center" }}>
                  {s.is_primary
                    ? <Icon name="check" size={14} style={{ color: "var(--lime)" }} />
                    : <span className="text-muted">—</span>}
                </td>
                {canEdit && (
                  <td>
                    {editId === s.area ? (
                      /* Formulaire d'édition inline */
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                          <input type="checkbox" checked={editForm.is_primary}
                            onChange={(e) => setEditForm({ ...editForm, is_primary: e.target.checked })} />
                          Primary zone
                        </label>
                        <input className="field-input" style={{ fontSize: 12 }}
                          placeholder="Notes…" value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                            disabled={editMutation.isPending}
                            onClick={() => editMutation.mutate({ areaId: s.area, payload: editForm })}>
                            {editMutation.isPending ? "…" : "Save"}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                            onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn-square" title="Edit" onClick={() => openEdit(s)}>
                          <IconEdit />
                        </button>
                        <button className="btn-square danger" title="Remove"
                          onClick={() => window.confirm(`Remove ${s.area_name} from the scope?`) && removeMutation.mutate(s.area)}>
                          <IconDeactivate />
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {scope.length === 0 && !showForm && (
        <p className="text-muted text-sm" style={{ margin: "0 0 var(--s-3)" }}>
          No geographic scope defined. Add Admin 1 regions or Admin 2 districts.
        </p>
      )}

      {/* Formulaire d'ajout */}
      {canEdit && showForm && (
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          borderRadius: "var(--r-3)", padding: "var(--s-3)", marginBottom: "var(--s-3)",
        }}>
          <div className="card-sub" style={{ marginBottom: "var(--s-2)" }}>Add a geographic zone</div>
          <div className="grid grid-2">
            {/* Pays (si projet multi-pays) */}
            {projectCountryIso3s.length > 1 && (
              <div className="field">
                <label className="field-label">Country</label>
                <select className="field-select" value={selectedCountryIso3}
                  onChange={(e) => { setSelectedCountryIso3(e.target.value); setSelAdmin1(""); setSelAdmin2(""); }}>
                  {(countries || []).map((c) => (
                    <option key={c.iso3} value={c.iso3}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Admin 1 */}
            <div className="field">
              <label className="field-label">Region / State (Admin 1) <span className="req">*</span></label>
              <select className="field-select" value={selAdmin1}
                onChange={(e) => { setSelAdmin1(e.target.value); setSelAdmin2(""); }}>
                <option value="">Select…</option>
                {admin1List
                  .filter((a) => !scopedAreaIds.has(a.id))
                  .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Admin 2 (si disponible) */}
            {selAdmin1 && hasAdmin2 && (
              <div className="field">
                <label className="field-label">District / Department (Admin 2)</label>
                <select className="field-select" value={selAdmin2}
                  onChange={(e) => setSelAdmin2(e.target.value)}>
                  <option value="">All districts (keep Admin 1)</option>
                  {admin2List
                    .filter((a) => !scopedAreaIds.has(a.id))
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="field-help">Leave empty to add the whole region.</span>
              </div>
            )}

            <div className="field" style={{ alignSelf: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)} />
                Primary intervention area
              </label>
            </div>
          </div>

          {addMutation.isError && (
            <div className="field-error mb-2">
              {addMutation.error?.detail || "Error adding zone."}
            </div>
          )}

          <div className="row">
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={handleAdd}
              disabled={!selAdmin1 || addMutation.isPending}>
              <Icon name="plus" size={14} />
              {addMutation.isPending ? "Adding…" : "Add zone"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {canEdit && !showForm && (
        <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={() => setShowForm(true)}>
          <IconPlus size={14} /> Add zone
        </button>
      )}
    </div>
  );
}

/**
 * SF-7 — Périmètre géographique GADM
 * Formulaire d'édition/ajout en accordéon inline dans le tableau.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";
import Icon from "./Icon.jsx";

export default function GeographicScope({ projectId, countries, canEdit }) {
  const qc = useQueryClient();

  // null = fermé, "add" = ajout, area_id (number) = édition d'une zone
  const [openFor, setOpenFor]     = useState(null);
  const [editScope, setEditScope] = useState(null);
  const [selAdmin1, setSelAdmin1] = useState("");
  const [selAdmin2, setSelAdmin2] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes]         = useState("");

  const projectCountryIso3s = (countries || []).map((c) => c.iso3).filter(Boolean);
  const firstIso3 = projectCountryIso3s[0] || "";
  const [selectedCountryIso3, setSelectedCountryIso3] = useState(firstIso3);

  const { data: scope = [], isLoading } = useQuery({
    queryKey: ["gadm-scope", projectId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/gadm-scope/`),
    staleTime: 30_000,
  });

  const { data: admin1List = [] } = useQuery({
    queryKey: ["gadm", selectedCountryIso3, 1],
    queryFn:  () => apiFetch(`/api/reference/gadm/?country=${selectedCountryIso3}&level=1`),
    enabled:  !!selectedCountryIso3,
    staleTime: 300_000,
  });

  const { data: admin2List = [] } = useQuery({
    queryKey: ["gadm", "children", selAdmin1],
    queryFn:  () => apiFetch(`/api/reference/gadm/?parent=${selAdmin1}&level=2`),
    enabled:  !!selAdmin1,
    staleTime: 300_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }); closeForm(); },
  });

  const removeMutation = useMutation({
    mutationFn: (areaId) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }),
  });

  const editMutation = useMutation({
    mutationFn: ({ areaId, payload }) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }); closeForm(); },
  });

  function openAdd() {
    setEditScope(null);
    setSelAdmin1(""); setSelAdmin2(""); setIsPrimary(false); setNotes("");
    setOpenFor("add");
  }

  function openEdit(s) {
    setEditScope(s);
    setSelAdmin1(String(s.area_level === 2 ? (s.parent_id || "") : s.area));
    setSelAdmin2(s.area_level === 2 ? String(s.area) : "");
    setIsPrimary(s.is_primary);
    setNotes(s.notes || "");
    setOpenFor(s.area);
  }

  function closeForm() {
    setOpenFor(null); setEditScope(null);
    setSelAdmin1(""); setSelAdmin2(""); setIsPrimary(false); setNotes("");
  }

  function handleSave() {
    const areaId = selAdmin2 || selAdmin1;
    if (!areaId) return;
    if (editScope) {
      if (String(editScope.area) !== String(areaId)) {
        removeMutation.mutate(editScope.area, {
          onSuccess: () => addMutation.mutate({ area: Number(areaId), is_primary: isPrimary, notes }),
        });
      } else {
        editMutation.mutate({ areaId: editScope.area, payload: { is_primary: isPrimary, notes } });
      }
    } else {
      addMutation.mutate({ area: Number(areaId), is_primary: isPrimary, notes });
    }
  }

  const hasAdmin2   = admin2List.length > 0;
  const scopedAreaIds = new Set(scope.map((s) => s.area));
  const isBusy = addMutation.isPending || editMutation.isPending || removeMutation.isPending;

  /* Formulaire inline partagé (ajout ou édition) */
  function InlineForm() {
    return (
      <tr>
        <td colSpan={canEdit ? 5 : 4} style={{ padding: "12px 16px", background: "color-mix(in srgb, var(--lime) 4%, var(--surface))", borderTop: "1px solid var(--rule)" }}>
          <div style={{ maxWidth: 640 }}>
            <div className="card-sub" style={{ marginBottom: 10 }}>
              {editScope ? "Edit geographic zone" : "Add a geographic zone"}
            </div>

            {/* Admin 1 */}
            <div className="grid grid-2" style={{ marginBottom: 8 }}>
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
              <div className="field">
                <label className="field-label">Region / State (Admin 1) <span className="req">*</span></label>
                <select className="field-select" value={selAdmin1}
                  onChange={(e) => { setSelAdmin1(e.target.value); setSelAdmin2(""); }}>
                  <option value="">Select…</option>
                  {admin1List
                    .filter((a) => {
                      if (editScope && String(a.id) === String(selAdmin1)) return true;
                      return !scopedAreaIds.has(a.id);
                    })
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {/* Admin 2 */}
            {selAdmin1 && hasAdmin2 && (
              <div className="field" style={{ marginBottom: 8 }}>
                <label className="field-label">District / Department (Admin 2)</label>
                <select className="field-select" value={selAdmin2}
                  onChange={(e) => setSelAdmin2(e.target.value)}>
                  <option value="">— All districts (keep Admin 1 level) —</option>
                  {admin2List
                    .filter((a) => {
                      if (editScope && String(a.id) === String(selAdmin2)) return true;
                      return !scopedAreaIds.has(a.id);
                    })
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="field-help">Leave empty to add the entire region.</span>
              </div>
            )}

            {/* Primary */}
            <div className="field" style={{ marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
                Primary intervention area
              </label>
            </div>

            {(addMutation.isError || editMutation.isError) && (
              <div className="field-error mb-2">
                {(addMutation.error || editMutation.error)?.detail || "Error saving zone."}
              </div>
            )}

            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                onClick={handleSave} disabled={!selAdmin1 || isBusy}>
                <Icon name="check" size={14} />
                {isBusy ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (isLoading) return <div className="card-body"><span className="spinner" /> Loading…</div>;

  return (
    <div className="card-body">
      {scope.length === 0 && openFor === null && (
        <p className="text-muted text-sm" style={{ margin: "0 0 var(--s-3)" }}>
          No geographic scope defined. Add Admin 1 regions or Admin 2 districts.
        </p>
      )}

      {(scope.length > 0 || openFor === "add") && (
        <table className="data-table mb-3" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Area</th>
              <th style={{ textAlign: "left" }}>Level</th>
              <th style={{ textAlign: "left" }}>Parent (Admin 1)</th>
              <th style={{ width: 80, textAlign: "center" }}>Primary</th>
              {canEdit && <th style={{ width: 80 }}></th>}
            </tr>
          </thead>
          <tbody>
            {scope.map((s) => (
              <>
                <tr key={s.id} style={{ background: openFor === s.area ? "color-mix(in srgb, var(--lime) 4%, var(--surface))" : undefined }}>
                  <td><strong>{s.area_name}</strong></td>
                  <td><span className="badge">{s.area_level === 1 ? "Admin 1" : "Admin 2"}</span></td>
                  <td className="text-muted text-sm">{s.parent_name || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    {s.is_primary
                      ? <Icon name="check" size={14} style={{ color: "var(--lime)" }} />
                      : <span className="text-muted">—</span>}
                  </td>
                  {canEdit && (
                    <td>
                      <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                        <button className="btn-square" title="Edit"
                          onClick={() => openFor === s.area ? closeForm() : openEdit(s)}>
                          <IconEdit />
                        </button>
                        <button className="btn-square danger" title="Remove"
                          onClick={() => window.confirm(`Remove ${s.area_name} from the scope?`) && removeMutation.mutate(s.area)}>
                          <IconDeactivate />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
                {/* Formulaire inline après la ligne éditée */}
                {canEdit && openFor === s.area && <InlineForm key={`edit-${s.area}`} />}
              </>
            ))}
            {/* Formulaire d'ajout en bas du tableau */}
            {canEdit && openFor === "add" && <InlineForm key="add" />}
          </tbody>
        </table>
      )}

      {canEdit && openFor === null && (
        <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openAdd}>
          <IconPlus size={14} /> Add zone
        </button>
      )}
    </div>
  );
}

/**
 * SF-7 — Périmètre géographique GADM
 * Affichage hiérarchique Admin1 → Admin2 avec accordéon inline.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";
import Icon from "./Icon.jsx";

export default function GeographicScope({ projectId, countries, canEdit }) {
  const qc = useQueryClient();

  const [openFor,   setOpenFor]   = useState(null); // null | "add" | area_id
  const [editScope, setEditScope] = useState(null);
  const [selAdmin1, setSelAdmin1] = useState("");
  const [selAdmin2, setSelAdmin2] = useState([]);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes,     setNotes]     = useState("");

  const projectCountryIso3s = (countries || []).map((c) => c.iso3).filter(Boolean);
  const [selectedIso3, setSelectedIso3] = useState(projectCountryIso3s[0] || "");

  const { data: scope = [], isLoading } = useQuery({
    queryKey: ["gadm-scope", projectId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/gadm-scope/`),
    staleTime: 30_000,
  });

  const { data: admin1List = [] } = useQuery({
    queryKey: ["gadm", selectedIso3, 1],
    queryFn:  () => apiFetch(`/api/reference/gadm/?country=${selectedIso3}&level=1`),
    enabled:  !!selectedIso3,
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

  const patchMutation = useMutation({
    mutationFn: ({ areaId, payload }) =>
      apiFetch(`/api/projects/${projectId}/gadm-scope/${areaId}/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gadm-scope", projectId] }); closeForm(); },
  });

  function openAdd() {
    setEditScope(null);
    setSelAdmin1(""); setSelAdmin2([]); setIsPrimary(false); setNotes("");
    setOpenFor("add");
  }

  function openEdit(s) {
    setEditScope(s);
    setSelAdmin1(String(s.area_level === 2 ? (s.parent_id || "") : s.area));
    setSelAdmin2(s.area_level === 2 ? [String(s.area)] : []);
    setIsPrimary(s.is_primary);
    setNotes(s.notes || "");
    setOpenFor(s.area);
  }

  function closeForm() {
    setOpenFor(null); setEditScope(null);
    setSelAdmin1(""); setSelAdmin2([]); setIsPrimary(false); setNotes("");
  }

  function handleSave() {
    if (editScope) {
      const newAreaId = selAdmin2.length === 1 ? Number(selAdmin2[0]) : Number(selAdmin1);
      if (!newAreaId) return;
      if (newAreaId !== editScope.area) {
        removeMutation.mutate(editScope.area, {
          onSuccess: () => addMutation.mutate({ area: newAreaId, is_primary: isPrimary, notes }),
        });
      } else {
        patchMutation.mutate({ areaId: editScope.area, payload: { is_primary: isPrimary, notes } });
      }
    } else {
      const areaIds = selAdmin2.length > 0
        ? selAdmin2.map(Number)
        : selAdmin1 ? [Number(selAdmin1)] : [];
      if (!areaIds.length) return;
      areaIds.forEach((id, i) => {
        addMutation.mutate({ area: id, is_primary: isPrimary && i === 0, notes });
      });
    }
  }

  const hasAdmin2     = admin2List.length > 0;
  const scopedAreaIds = new Set(scope.map((s) => s.area));
  const isBusy = addMutation.isPending || removeMutation.isPending || patchMutation.isPending;

  const admin1Options = admin1List.filter((a) => {
    if (editScope && String(a.id) === String(selAdmin1)) return true;
    return !scopedAreaIds.has(a.id);
  });
  const admin2Options = admin2List.filter((a) => {
    if (editScope && selAdmin2.includes(String(a.id))) return true;
    return !scopedAreaIds.has(a.id);
  });

  /* ── Groupement hiérarchique ── */
  // Séparer Admin1 standalone et Admin2 groupés par parent
  const admin1Scope = scope.filter((s) => s.area_level === 1);
  const admin2Scope = scope.filter((s) => s.area_level === 2);

  // Construire les groupes : Admin1 présents directement OU parents d'Admin2
  const groupMap = {}; // parent_name → [admin2 scopes]
  admin2Scope.forEach((s) => {
    const key = s.parent_name || "Unknown region";
    if (!groupMap[key]) groupMap[key] = { parentId: s.parent_id, items: [] };
    groupMap[key].items.push(s);
  });

  // Admin1 dans le scope mais sans enfants Admin2 → affichés seuls
  const admin1WithChildren = new Set(admin2Scope.map((s) => s.parent_id));

  /* ── Formulaire inline ── */
  const formRow = (
    <div style={{
      background: "color-mix(in srgb, var(--lime) 5%, var(--surface))",
      border: "1px solid color-mix(in srgb, var(--lime) 25%, transparent)",
      borderRadius: "var(--r-3)",
      padding: "var(--s-3)",
      margin: "var(--s-2) 0",
    }}>
      <div className="card-sub" style={{ marginBottom: 10 }}>
        {editScope ? "Edit geographic zone" : "Add a geographic zone"}
      </div>

      {projectCountryIso3s.length > 1 && (
        <div className="field">
          <label className="field-label">Country</label>
          <select className="field-select" value={selectedIso3}
            onChange={(e) => { setSelectedIso3(e.target.value); setSelAdmin1(""); setSelAdmin2([]); }}>
            {(countries || []).map((c) => (
              <option key={c.iso3} value={c.iso3}>{c.flag} {c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="field-label">Region / State (Admin 1) <span className="req">*</span></label>
        <select className="field-select" value={selAdmin1}
          onChange={(e) => { setSelAdmin1(e.target.value); setSelAdmin2([]); }}>
          <option value="">Select…</option>
          {admin1Options.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
      </div>

      {selAdmin1 && hasAdmin2 && (
        <div className="field">
          <label className="field-label">District / Department (Admin 2)</label>
          <select className="field-select field-multi" multiple
            value={selAdmin2}
            onChange={(e) => setSelAdmin2(Array.from(e.target.selectedOptions).map((o) => o.value))}>
            {admin2Options.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.name}</option>
            ))}
          </select>
          <span className="field-help">
            {editScope
              ? "Select a district, or leave empty to keep the whole region."
              : "Ctrl/Cmd + click for multiple districts. Leave empty to add the entire region."}
          </span>
        </div>
      )}

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          Primary intervention area
        </label>
      </div>

      {(addMutation.isError || patchMutation.isError) && (
        <div className="field-error mb-2">
          {(addMutation.error || patchMutation.error)?.detail || "Error saving."}
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
  );

  /* ── Ligne de zone ── */
  function ZoneRow({ s, indent = false }) {
    const isEditing = openFor === s.area;
    return (
      <>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          marginLeft: indent ? 24 : 0,
          borderRadius: "var(--r-2)",
          background: isEditing ? "color-mix(in srgb, var(--lime) 6%, var(--surface))" : undefined,
          borderLeft: indent ? "2px solid color-mix(in srgb, var(--lime) 30%, transparent)" : undefined,
        }}>
          {/* Icône niveau */}
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: indent
              ? "color-mix(in srgb, var(--navy, #1B5A8C) 10%, var(--surface))"
              : "color-mix(in srgb, var(--lime) 15%, var(--surface))",
            color: indent ? "var(--navy, #1B5A8C)" : "var(--lime-dark, var(--lime))",
          }}>
            <Icon name={indent ? "map-pin" : "map"} size={13} />
          </div>

          {/* Nom */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{s.area_name}</span>
            {s.notes && (
              <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>{s.notes}</span>
            )}
          </div>

          {/* Primary */}
          {s.is_primary && (
            <span className="badge badge-lime" style={{ fontSize: 10 }}>Primary</span>
          )}

          {/* Actions */}
          {canEdit && (
            <span className="row" style={{ gap: 4, flexShrink: 0 }}>
              <button className="btn-square" title="Edit"
                onClick={() => isEditing ? closeForm() : openEdit(s)}>
                <IconEdit />
              </button>
              <button className="btn-square danger" title="Remove"
                onClick={() => window.confirm(`Remove ${s.area_name}?`) && removeMutation.mutate(s.area)}>
                <IconDeactivate />
              </button>
            </span>
          )}
        </div>

        {/* Formulaire inline sous la ligne */}
        {canEdit && isEditing && (
          <div style={{ marginLeft: indent ? 24 : 0 }}>
            {formRow}
          </div>
        )}
      </>
    );
  }

  if (isLoading) return <div className="card-body"><span className="spinner" /> Loading…</div>;

  const isEmpty = scope.length === 0;

  return (
    <div className="card-body">
      {isEmpty && openFor === null && (
        <p className="text-muted text-sm" style={{ margin: "0 0 var(--s-3)" }}>
          No geographic scope defined. Add Admin 1 regions or Admin 2 districts.
        </p>
      )}

      {/* Affichage hiérarchique */}
      {!isEmpty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "var(--s-3)" }}>

          {/* Admin 1 seuls (sans enfants Admin2 dans le scope) */}
          {admin1Scope
            .filter((s) => !admin1WithChildren.has(s.area))
            .map((s) => <ZoneRow key={s.id} s={s} indent={false} />)}

          {/* Groupes Admin1 → Admin2 */}
          {Object.entries(groupMap).map(([parentName, group]) => {
            // Vérifier si Admin1 lui-même est dans le scope
            const admin1InScope = admin1Scope.find((s) => s.area === group.parentId);
            return (
              <div key={parentName} style={{
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-3)",
                overflow: "hidden",
              }}>
                {/* Header Admin 1 */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px",
                  background: "var(--paper)",
                  borderBottom: "1px solid var(--rule)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "color-mix(in srgb, var(--lime) 15%, var(--surface))",
                    color: "var(--lime-dark, var(--lime))",
                  }}>
                    <Icon name="map" size={13} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{parentName}</span>
                  <span className="text-muted text-sm">{group.items.length} district{group.items.length > 1 ? "s" : ""}</span>
                  {admin1InScope?.is_primary && (
                    <span className="badge badge-lime" style={{ fontSize: 10 }}>Primary</span>
                  )}
                  {canEdit && admin1InScope && (
                    <span className="row" style={{ gap: 4 }}>
                      <button className="btn-square" title="Edit Admin 1"
                        onClick={() => openFor === admin1InScope.area ? closeForm() : openEdit(admin1InScope)}>
                        <IconEdit />
                      </button>
                      <button className="btn-square danger" title="Remove"
                        onClick={() => window.confirm(`Remove ${parentName}?`) && removeMutation.mutate(admin1InScope.area)}>
                        <IconDeactivate />
                      </button>
                    </span>
                  )}
                </div>
                {admin1InScope && canEdit && openFor === admin1InScope.area && (
                  <div style={{ padding: "0 12px" }}>{formRow}</div>
                )}

                {/* Admin 2 */}
                <div style={{ padding: "4px 0" }}>
                  {group.items.map((s) => (
                    <div key={s.id} style={{ padding: "0 8px" }}>
                      <ZoneRow s={s} indent={true} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulaire d'ajout en bas */}
      {canEdit && openFor === "add" && formRow}

      {canEdit && openFor === null && (
        <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openAdd}>
          <IconPlus size={14} /> Add zone
        </button>
      )}
    </div>
  );
}

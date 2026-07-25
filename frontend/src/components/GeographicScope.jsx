/**
 * SF-7 — Périmètre géographique GADM
 * Onglets horizontaux par Admin 1, districts en chips à l'intérieur.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";
import { useDialog, DialogModal } from "./Dialog.jsx";
import Icon from "./Icon.jsx";

export default function GeographicScope({ projectId, countries, canEdit }) {
  const qc = useQueryClient();

  const [openFor,   setOpenFor]   = useState(null);
  const [editScope, setEditScope] = useState(null);
  const [selAdmin1, setSelAdmin1] = useState("");
  const [selAdmin2, setSelAdmin2] = useState([]);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes,     setNotes]     = useState("");
  const [activeTab, setActiveTab] = useState(null); // admin1 name actif
  const dialog = useDialog();

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

  /* ── Groupement ── */
  const admin1Scope = scope.filter((s) => s.area_level === 1);
  const admin2Scope = scope.filter((s) => s.area_level === 2);

  // Grouper Admin2 par parent
  const groupMap = {};
  admin2Scope.forEach((s) => {
    const key = s.parent_name || "Other";
    if (!groupMap[key]) groupMap[key] = { parentId: s.parent_id, items: [] };
    groupMap[key].items.push(s);
  });

  // Construire les onglets : Admin1 standalone + groupes Admin1→Admin2
  const tabs = [];

  // Admin1 seuls
  const admin1WithChildren = new Set(admin2Scope.map((s) => s.parent_id));
  admin1Scope
    .filter((s) => !admin1WithChildren.has(s.area))
    .forEach((s) => tabs.push({ key: s.area_name, label: s.area_name, scope: s, children: [] }));

  // Groupes Admin1 + leurs Admin2
  Object.entries(groupMap).forEach(([name, group]) => {
    const parent = admin1Scope.find((s) => s.area === group.parentId);
    tabs.push({ key: name, label: name, scope: parent || null, children: group.items });
  });

  // Tri alphabétique
  tabs.sort((a, b) => a.label.localeCompare(b.label));

  // Onglet actif par défaut
  const currentTab = activeTab && tabs.find((t) => t.key === activeTab)
    ? activeTab
    : tabs[0]?.key || null;
  const activeTabData = tabs.find((t) => t.key === currentTab);

  /* ── Formulaire ── */
  const formJsx = (
    <div style={{
      background: "color-mix(in srgb, var(--lime) 4%, var(--surface))",
      border: "1px solid color-mix(in srgb, var(--lime) 25%, transparent)",
      borderRadius: "var(--r-3)",
      padding: "var(--s-3)",
      marginTop: "var(--s-3)",
    }}>
      <div className="card-sub" style={{ marginBottom: 10 }}>
        {editScope ? "Edit zone" : "Add a geographic zone"}
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
              : "Ctrl/Cmd + click for multiple. Leave empty to add the entire region."}
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

  if (isLoading) return <div className="card-body"><span className="spinner" /> Loading…</div>;


  return (
    <div className="card-body">
      <DialogModal {...dialog.dialogProps} />
      {scope.length === 0 && openFor === null && (
        <p className="text-muted text-sm" style={{ margin: "0 0 var(--s-3)" }}>
          No geographic scope defined. Add Admin 1 regions or Admin 2 districts.
        </p>
      )}

      {/* Onglets horizontaux */}
      {tabs.length > 0 && (
        <div>
          {/* Barre d'onglets */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 0, borderBottom: "2px solid var(--rule)" }}>
            {tabs.map((t) => {
              const isActive = t.key === currentTab;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px",
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--lime-dark, var(--lime))" : "var(--text-muted)",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: isActive ? "2px solid var(--lime, #A4C53F)" : "2px solid transparent",
                    marginBottom: -2,
                    borderRadius: 0,
                  }}
                >
                  <Icon name="layers" size={13} />
                  {t.label}
                  {t.children.length > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      background: isActive ? "var(--lime, #A4C53F)" : "var(--rule)",
                      color: isActive ? "#fff" : "var(--text-muted)",
                      borderRadius: 10, padding: "1px 6px",
                    }}>
                      {t.children.length}
                    </span>
                  )}
                  {(t.scope?.is_primary) && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lime)", flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Contenu de l'onglet actif */}
          {activeTabData && (
            <div style={{ padding: "var(--s-3) 0" }}>
              {/* Infos Admin1 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: activeTabData.children.length > 0 ? 12 : 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, flex: 1,
                }}>
                  <Icon name="flag" size={14} style={{ color: "var(--lime-dark, var(--lime))", flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{activeTabData.label}</span>
                  {activeTabData.scope?.is_primary && (
                    <span className="badge badge-lime" style={{ fontSize: 10 }}>Primary</span>
                  )}
                  {activeTabData.children.length === 0 && activeTabData.scope && (
                    <span className="text-muted text-sm">· Whole region</span>
                  )}
                  {activeTabData.children.length > 0 && (
                    <span className="text-muted text-sm">
                      · {activeTabData.children.length} district{activeTabData.children.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {canEdit && activeTabData.scope && (
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn-square" title="Edit"
                      onClick={() => openFor === activeTabData.scope.area ? closeForm() : openEdit(activeTabData.scope)}>
                      <IconEdit />
                    </button>
                    <button className="btn-square danger" title="Remove region"
                      onClick={async () => { const ok = await dialog.confirm(`Remove "${activeTabData.label}" from the geographic scope?`, { title: "Remove zone", confirmLabel: "Remove", danger: true }); if (ok) removeMutation.mutate(activeTabData.scope.area); }}>
                      <IconDeactivate />
                    </button>
                  </span>
                )}
              </div>

              {/* Formulaire édition Admin1 */}
              {canEdit && activeTabData.scope && openFor === activeTabData.scope.area && formJsx}

              {/* Chips Admin2 */}
              {activeTabData.children.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {activeTabData.children.map((s) => (
                    <div key={s.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px 5px 8px",
                      background: s.is_primary
                        ? "color-mix(in srgb, var(--lime) 15%, var(--surface))"
                        : "var(--paper)",
                      border: `1px solid ${s.is_primary ? "color-mix(in srgb, var(--lime) 40%, transparent)" : "var(--rule)"}`,
                      borderRadius: 20,
                      fontSize: 12, fontWeight: s.is_primary ? 600 : 400,
                    }}>
                      <Icon name="map-pin" size={11}
                        style={{ color: s.is_primary ? "var(--lime-dark, var(--lime))" : "var(--text-muted)", flexShrink: 0 }} />
                      <span>{s.area_name}</span>
                      {s.is_primary && (
                        <span style={{ fontSize: 9, color: "var(--lime-dark, var(--lime))", fontWeight: 700 }}>★</span>
                      )}
                      {canEdit && (
                        <span className="row" style={{ gap: 2, marginLeft: 2 }}>
                          <button
                            onClick={() => openFor === s.area ? closeForm() : openEdit(s)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "var(--text-muted)", lineHeight: 1 }}
                            title="Edit">
                            <Icon name="pencil" size={10} />
                          </button>
                          <button
                            onClick={async () => { const ok = await dialog.confirm(`Remove district "${s.area_name}" from scope?`, { title: "Remove district", confirmLabel: "Remove", danger: true }); if (ok) removeMutation.mutate(s.area); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "var(--text-muted)", lineHeight: 1 }}
                            title="Remove">
                            <Icon name="x" size={10} />
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Formulaire édition Admin2 */}
              {canEdit && activeTabData.children.some((s) => openFor === s.area) && formJsx}
            </div>
          )}
        </div>
      )}

      {/* Formulaire d'ajout */}
      {canEdit && openFor === "add" && formJsx}

      {/* Bouton Add zone */}
      {canEdit && openFor === null && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: scope.length > 0 ? "var(--s-3)" : 0 }}>
          <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
            onClick={openAdd}>
            <IconPlus size={14} /> Add zone
          </button>
        </div>
      )}
    </div>
  );
}

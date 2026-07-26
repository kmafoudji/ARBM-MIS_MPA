import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import RichText, { stripHtml } from "../components/RichText";
import { useDialog, DialogModal } from "../components/Dialog.jsx";
import RichTextEditor from "../components/RichTextEditor";
import TagInput from "../components/TagInput";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";

const LEVELS = [
  { key: "activity",             label: "Activities",            parentKey: null,                 icon: "zap"          },
  { key: "output",               label: "Outputs",               parentKey: "activity",           icon: "package"      },
  { key: "immediate_outcome",    label: "Immediate Outcomes",    parentKey: "output",             icon: "trending-up"  },
  { key: "intermediate_outcome", label: "Intermediate Outcomes", parentKey: "immediate_outcome",  icon: "layers"       },
];

const EMPTY_NODE_FORM = {
  parent: "", statement: "",
  means_of_verification: "", assumptions: "",
  risks_mitigation: "", adaptation_strategy: "", gender_climate_tag: "",
};

/* ── Formulaire inline indicateur + baseline + cibles ───────────────────── */
function IndicatorPanel({ projectId, node, onSaved }) {
  const qc = useQueryClient();
  const dialog = useDialog();
  const [mode, setMode]       = useState("view"); // view | attach | baseline | targets
  const [search, setSearch]   = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [chainLevel] = useState(node.chain_level || "output"); // verrouillé sur le niveau du nœud
  const [baselineForm, setBaselineForm] = useState({
    baseline_value: node.logframe_baseline_value ?? "",
    baseline_year:  node.logframe_baseline_year  ?? "",
    baseline_source: "",
    measurement_frequency: "",
    notes: "",
  });
  const [targetForm, setTargetForm] = useState({ target_value: "", target_date: "", label: "" });
  const [targets, setTargets]       = useState([]);

  /* Catalogue */
  const { data: indicators, isLoading: indLoading } = useQuery({
    queryKey: ["indicators", search],
    queryFn: () => apiFetch(`/api/results/indicators/?${search ? `q=${encodeURIComponent(search)}` : ""}`),
    enabled: mode === "attach",
  });

  /* Cibles existantes (si ligne logframe déjà attachée) */
  const { data: existingRow } = useQuery({
    queryKey: ["logframe-row", projectId, node.logframe_row_id],
    queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/${node.logframe_row_id}/`),
    enabled: !!node.logframe_row_id,
  });

  /* Choices niveau chaîne */
  const { data: choices } = useQuery({
    queryKey: ["logframe-choices", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/choices/`),
    enabled: mode === "attach",
  });

  /* Créer logframe_row + attacher au nœud */
  const attachMutation = useMutation({
    mutationFn: async () => {
      // 1. Créer la ligne logframe
      const row = await apiFetch(`/api/projects/${projectId}/logframe/`, {
        method: "POST",
        body: JSON.stringify({ indicator: Number(selectedId), chain_level: chainLevel }),
      });
      // 2. Attacher la ligne au nœud ToC
      await apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ logframe_row: row.id }),
      });
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      qc.invalidateQueries({ queryKey: ["logframe", projectId] });
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      onSaved();
      setMode("view");
    },
  });

  /* Sauvegarder baseline */
  const baselineMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/logframe/${node.logframe_row_id}/`, {
        method: "PATCH", body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      qc.invalidateQueries({ queryKey: ["logframe-row", projectId, node.logframe_row_id] });
      onSaved();
      setMode("view");
    },
  });

  /* Ajouter une cible */
  const targetMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/logframe/${node.logframe_row_id}/targets/`, {
        method: "POST", body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logframe-row", projectId, node.logframe_row_id] });
      qc.invalidateQueries({ queryKey: ["logframe", projectId] });
      setTargetForm({ target_value: "", target_date: "", label: "" });
    },
  });

  /* Supprimer une cible */
  const deleteTargetMutation = useMutation({
    mutationFn: (tid) =>
      apiFetch(`/api/projects/${projectId}/logframe/${node.logframe_row_id}/targets/${tid}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logframe-row", projectId, node.logframe_row_id] }),
  });

  /* Détacher l'indicateur du nœud */
  const detachMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, {
        method: "PATCH", body: JSON.stringify({ logframe_row: null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      onSaved();
      setMode("view");
    },
  });

  const hasIndicator = !!node.logframe_indicator_code;
  const rowTargets   = existingRow?.targets || [];

  /* ── Vue indicator ── */
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--r-2)", padding: "12px 14px", marginTop: 10,
    }}>
      <DialogModal {...dialog.dialogProps} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasIndicator ? 10 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Indicator &amp; Measurement
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {hasIndicator && mode === "view" && (
            <>
              <button className="btn btn-ghost btn-sm" style={{ gap: 5, fontSize: 11 }} onClick={() => {
                setBaselineForm({
                  baseline_value: node.logframe_baseline_value ?? "",
                  baseline_year:  node.logframe_baseline_year  ?? "",
                  baseline_source: existingRow?.baseline_source ?? "",
                  measurement_frequency: existingRow?.measurement_frequency ?? "",
                  notes: existingRow?.notes ?? "",
                });
                setMode("baseline");
              }}>
                <Icon name="pencil" size={11} /> Baseline
              </button>
              <button className="btn btn-ghost btn-sm" style={{ gap: 5, fontSize: 11 }} onClick={() => setMode("targets")}>
                <Icon name="plus" size={11} /> Target
              </button>
              <button className="btn btn-ghost btn-sm" style={{ gap: 5, fontSize: 11, color: "var(--red, #dc2626)" }}
                onClick={async () => { const ok = await dialog.confirm("The logframe row and targets will be preserved.", { title: "Detach indicator?", confirmLabel: "Detach", danger: true }); if (ok) detachMutation.mutate(); }}>
                <Icon name="x" size={11} /> Detach
              </button>
            </>
          )}
          {!hasIndicator && mode === "view" && (
            <button className="btn btn-primary btn-sm" style={{ gap: 5, fontSize: 11 }} onClick={() => setMode("attach")}>
              <Icon name="plus" size={11} /> Attach indicator
            </button>
          )}
          {mode !== "view" && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setMode("view")}>
              <Icon name="x" size={11} /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Vue résumé */}
      {mode === "view" && hasIndicator && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="badge" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{node.logframe_indicator_code}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{node.logframe_indicator_name}</span>
            <span className="text-muted" style={{ fontSize: 11 }}>{node.logframe_indicator_unit}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
            <span>
              <span className="text-muted">Baseline: </span>
              <strong>{node.logframe_baseline_value != null ? `${fmtNum(node.logframe_baseline_value)} ${node.logframe_indicator_unit}` : "—"}</strong>
              {node.logframe_baseline_year ? <span className="text-muted"> ({node.logframe_baseline_year})</span> : ""}
            </span>
            {rowTargets.length > 0 && (
              <span>
                <span className="text-muted">Targets: </span>
                <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                  {rowTargets.map((t) => (
                    <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px", borderRadius: 99,
                      background: t.status === "approved" ? "#dcfce7" : t.status === "revised" ? "#f3f4f6" : "#fef9c3",
                      color: t.status === "approved" ? "#166534" : t.status === "revised" ? "#6b7280" : "#854d0e",
                      textDecoration: t.status === "revised" ? "line-through" : "none",
                    }}>
                      {t.is_original_pad && <span title="Original PAD target" style={{ fontWeight: 700 }}>PAD·</span>}
                      {t.label || new Date(t.target_date).getFullYear()} : {fmtNum(t.target_value)}
                      {t.status === "approved" && !t.is_original_pad && (
                        <button type="button" title="Revise this target"
                          style={{ border: "none", background: "none", cursor: "pointer", padding: "0 0 0 2px", color: "#166534", fontSize: 9, fontWeight: 700 }}
                          onClick={(e) => { e.stopPropagation(); alert("Revision workflow: POST /logframe/" + node.logframe_row_id + "/targets/" + t.id + "/revise/ — à brancher"); }}>
                          ✎
                        </button>
                      )}
                      {!t.is_original_pad && t.status !== "revised" && (
                      <button type="button" style={{ border: "none", background: "none", cursor: "pointer", padding: "0 0 0 4px", color: "inherit" }}
                        onClick={async () => { const ok = await dialog.confirm("This target will be permanently deleted.", { title: "Delete target?", confirmLabel: "Delete", danger: true }); if (ok) deleteTargetMutation.mutate(t.id); }}>
                        ×
                      </button>
                      )}
                    </span>
                  ))}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {mode === "view" && !hasIndicator && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>No indicator attached — click "Attach indicator" to link one from the LLF2 catalogue.</p>
      )}

      {/* Mode : attacher un indicateur */}
      {mode === "attach" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8, marginBottom: 8 }}>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Search catalogue</label>
              <input className="field-input" placeholder="Code or keyword..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Level in chain</label>
              <div className="field-input" style={{ background: "var(--surface-2)", color: "var(--muted)", cursor: "default", fontSize: 12 }}>
                {node.chain_level_display || node.chain_level}
              </div>
            </div>
          </div>
          <select className="field-select" style={{ marginBottom: 10 }} value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">{indLoading ? "Loading..." : "Select an indicator..."}</option>
            {indicators?.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.code} — {ind.name.slice(0, 70)}</option>
            ))}
          </select>
          {attachMutation.isError && (
            <div className="field-error" style={{ marginBottom: 8 }}>
              {(() => {
                const d = attachMutation.error?.detail;
                if (!d) return "Error attaching indicator.";
                if (typeof d === "string") return d;
                if (Array.isArray(d)) return d.join(" ");
                if (d.non_field_errors) return d.non_field_errors.join(" ");
                if (d.indicator) return `Indicator: ${d.indicator.join(" ")}`;
                return JSON.stringify(d);
              })()}
            </div>
          )}
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }}
            disabled={!selectedId || !chainLevel || attachMutation.isPending}
            onClick={() => attachMutation.mutate()}>
            <Icon name="check" size={13} /> {attachMutation.isPending ? "Attaching..." : "Attach to node"}
          </button>
        </div>
      )}

      {/* Mode : saisir baseline */}
      {mode === "baseline" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Baseline value ({node.logframe_indicator_unit})</label>
              <input className="field-input" type="number" step="any" value={baselineForm.baseline_value}
                onChange={(e) => setBaselineForm({ ...baselineForm, baseline_value: e.target.value })} />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Reference year</label>
              <input className="field-input" type="number" min="2000" max="2050" value={baselineForm.baseline_year}
                onChange={(e) => setBaselineForm({ ...baselineForm, baseline_year: e.target.value })} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="field-label" style={{ fontSize: 11 }}>Source</label>
              <input className="field-input" value={baselineForm.baseline_source}
                onChange={(e) => setBaselineForm({ ...baselineForm, baseline_source: e.target.value })} />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Measurement frequency</label>
              <select className="field-select" value={baselineForm.measurement_frequency}
                onChange={(e) => setBaselineForm({ ...baselineForm, measurement_frequency: e.target.value })}>
                <option value="">Select</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-annual</option>
                <option value="annual">Annual</option>
                <option value="end_of_project">End of project</option>
              </select>
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Notes</label>
              <input className="field-input" value={baselineForm.notes}
                onChange={(e) => setBaselineForm({ ...baselineForm, notes: e.target.value })} />
            </div>
          </div>
          {baselineMutation.isError && (
            <div className="field-error" style={{ marginBottom: 8 }}>{JSON.stringify(baselineMutation.error?.detail)}</div>
          )}
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }}
            disabled={baselineMutation.isPending}
            onClick={() => baselineMutation.mutate({
              baseline_value: baselineForm.baseline_value || null,
              baseline_year:  baselineForm.baseline_year  || null,
              baseline_source: baselineForm.baseline_source,
              measurement_frequency: baselineForm.measurement_frequency || null,
              notes: baselineForm.notes,
            })}>
            <Icon name="check" size={13} /> {baselineMutation.isPending ? "Saving..." : "Save baseline"}
          </button>
        </div>
      )}

      {/* Mode : ajouter une cible */}
      {mode === "targets" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Target value ({node.logframe_indicator_unit})</label>
              <input className="field-input" type="number" step="any" value={targetForm.target_value}
                onChange={(e) => setTargetForm({ ...targetForm, target_value: e.target.value })} />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Target date</label>
              <input className="field-input" type="date" value={targetForm.target_date}
                onChange={(e) => setTargetForm({ ...targetForm, target_date: e.target.value })} />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>Label (e.g. 2025, Q3)</label>
              <input className="field-input" value={targetForm.label}
                onChange={(e) => setTargetForm({ ...targetForm, label: e.target.value })} />
            </div>
          </div>
          {/* Cibles déjà saisies */}
          {rowTargets.length > 0 && (
            <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {rowTargets.map((t) => (
                <span key={t.id} className="badge badge-lime" style={{ fontSize: 11 }}>
                  {t.label || new Date(t.target_date).getFullYear()} : {fmtNum(t.target_value)}
                  <button type="button" style={{ border: "none", background: "none", cursor: "pointer", padding: "0 0 0 4px", color: "inherit" }}
                    onClick={async () => { const ok = await dialog.confirm("This target will be permanently deleted.", { title: "Delete target?", confirmLabel: "Delete", danger: true }); if (ok) deleteTargetMutation.mutate(t.id); }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {targetMutation.isError && (
            <div className="field-error" style={{ marginBottom: 8 }}>{JSON.stringify(targetMutation.error?.detail)}</div>
          )}
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }}
            disabled={!targetForm.target_value || !targetForm.target_date || targetMutation.isPending}
            onClick={() => targetMutation.mutate(targetForm)}>
            <Icon name="plus" size={13} /> {targetMutation.isPending ? "Adding..." : "Add target"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── NodeCard ────────────────────────────────────────────────────────────── */
function NodeCard({ node, projectId, onSaved, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState(node);
  const dialog = useDialog();

  const updateMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, {
        method: "PATCH", body: JSON.stringify(payload),
      }),
    onSuccess: () => { setEditing(false); onSaved(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, { method: "DELETE" }),
    onSuccess: onDeleted,
  });

  function startEdit() { setForm(node); setEditing(true); setExpanded(true); }

  function submitEdit(e) {
    e.preventDefault();
    const { parent, chain_level, code, id, toc, created_at, updated_at, chain_level_display,
            logframe_row_id, logframe_indicator_code, logframe_indicator_name,
            logframe_indicator_unit, logframe_baseline_value, logframe_baseline_year,
            ...payload } = form;
    updateMutation.mutate(payload);
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--r-3)", padding: "var(--s-3)",
    }}>
      <DialogModal {...dialog.dialogProps} />
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => !editing && setExpanded(!expanded)}>
        <div className="row" style={{ gap: 10 }}>
          <span className="text-mono badge">{node.code}</span>
          <span style={{ fontWeight: 500 }}>{stripHtml(node.statement)}</span>
        </div>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--text-muted)" }} />
      </div>

      {expanded && !editing && (
        <div>
          {/* Panneau indicateur */}
          <IndicatorPanel projectId={projectId} node={node} onSaved={onSaved} />

          <div className="dl mt-3">
            <div><div className="dl-term">Means of Verification</div><div className="dl-desc"><RichText value={node.means_of_verification} /></div></div>
            <div><div className="dl-term">Assumptions</div><div className="dl-desc"><RichText value={node.assumptions} /></div></div>
            <div><div className="dl-term">Risk Mitigation</div><div className="dl-desc"><RichText value={node.risks_mitigation} /></div></div>
            <div><div className="dl-term">Adaptation Strategy</div><div className="dl-desc"><RichText value={node.adaptation_strategy} /></div></div>
            <div>
              <div className="dl-term">Gender / Climate Tag</div>
              <div className="dl-desc">
                {node.gender_climate_tag
                  ? <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {node.gender_climate_tag.split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => (
                        <span key={i} className="badge">{t}</span>
                      ))}
                    </div>
                  : "—"}
              </div>
            </div>
          </div>
          <div className="row mt-2">
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={startEdit}>
              <Icon name="pencil" size={14} /> Edit
            </button>
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button"
              disabled={deleteMutation.isPending}
              onClick={async () => { const ok = await dialog.confirm(`All child nodes will also be deleted. This action is irreversible.`, { title: `Delete node ${node.code}?`, confirmLabel: "Delete", danger: true }); if (ok) deleteMutation.mutate(); }}>
              <Icon name="trash" size={14} /> {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={submitEdit} className="mt-2">
          <div className="field">
            <label className="field-label">Statement</label>
            <RichTextEditor value={form.statement} onChange={(html) => setForm({ ...form, statement: html })} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label className="field-label">Gender / Climate Tag</label>
              <TagInput value={form.gender_climate_tag}
                onChange={(v) => setForm({ ...form, gender_climate_tag: v })}
                placeholder="gender, climate, youth..." />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Means of Verification</label>
            <RichTextEditor value={form.means_of_verification} onChange={(html) => setForm({ ...form, means_of_verification: html })} />
          </div>
          <div className="field">
            <label className="field-label">Assumptions</label>
            <RichTextEditor value={form.assumptions} onChange={(html) => setForm({ ...form, assumptions: html })} />
          </div>
          <div className="field">
            <label className="field-label">Risk Mitigation</label>
            <RichTextEditor value={form.risks_mitigation} onChange={(html) => setForm({ ...form, risks_mitigation: html })} />
          </div>
          <div className="field">
            <label className="field-label">Adaptation Strategy</label>
            <RichTextEditor value={form.adaptation_strategy} onChange={(html) => setForm({ ...form, adaptation_strategy: html })} />
          </div>
          {updateMutation.isError && (
            <div className="field-error mb-3">{JSON.stringify(updateMutation.error?.detail)}</div>
          )}
          <div className="row">
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={updateMutation.isPending}>
              <Icon name="check" size={14} /> {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={() => setEditing(false)}>
              <Icon name="x" size={14} /> Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ── LevelSection ────────────────────────────────────────────────────────── */
function LevelSection({ level, nodes, parentOptions, projectId, onChanged, readOnly, collapsed, onToggleCollapse }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState(EMPTY_NODE_FORM);

  const createMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/toc/nodes/`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { setAdding(false); setForm(EMPTY_NODE_FORM); onChanged(); },
  });

  function submit(e) {
    e.preventDefault();
    createMutation.mutate({
      chain_level: level.key, parent: form.parent || null,
      statement: form.statement, means_of_verification: form.means_of_verification,
      assumptions: form.assumptions, risks_mitigation: form.risks_mitigation,
      adaptation_strategy: form.adaptation_strategy, gender_climate_tag: form.gender_climate_tag,
    });
  }

  return (
    <div className="card card-flush mb-3">
      <div className="card-header">
        <div className="row" style={{ gap: 10, alignItems: "center", cursor: "pointer" }} onClick={onToggleCollapse}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: "color-mix(in srgb, var(--lime-dark) 14%, transparent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--lime-dark)",
          }}>
            <Icon name={level.icon} size={18} />
          </span>
          <div>
            <h2 className="card-title">{level.label}</h2>
            <div className="card-sub">{nodes.length} node{nodes.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!adding && !readOnly && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Add
            </button>
          )}
          {adding && !readOnly && (
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={() => { setAdding(false); setForm(EMPTY_NODE_FORM); }}>
              <Icon name="x" size={14} /> Cancel
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand" : "Collapse"}>
            <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={16} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="card-body">
          {nodes.length === 0 && !adding && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>No nodes at this level.</p>
          )}
          <div className="row" style={{ flexDirection: "column", gap: 10, alignItems: "stretch" }}>
            {nodes.map((n) => (
              <NodeCard key={n.id} node={n} projectId={projectId} onSaved={onChanged} onDeleted={onChanged} />
            ))}
          </div>

          {adding && (
            <form onSubmit={submit} className="mt-3" style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--r-3)", padding: "var(--s-3)",
            }}>
              {level.parentKey && (
                <div className="field">
                  <label className="field-label">Parent node <span className="req">*</span></label>
                  <select className="field-select" value={form.parent}
                    onChange={(e) => setForm({ ...form, parent: e.target.value })} required>
                    <option value="">Select</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} — {stripHtml(p.statement)}</option>
                    ))}
                  </select>
                  {parentOptions.length === 0 && (
                    <span className="field-help">No node at a higher level yet — create one first.</span>
                  )}
                </div>
              )}
              <div className="field">
                <label className="field-label">Statement <span className="req">*</span></label>
                <RichTextEditor value={form.statement}
                  onChange={(html) => setForm({ ...form, statement: html })} />
              </div>
              <div className="field">
                <label className="field-label">Means of Verification</label>
                <RichTextEditor value={form.means_of_verification}
                  onChange={(html) => setForm({ ...form, means_of_verification: html })} />
              </div>
              <div className="field">
                <label className="field-label">Assumptions</label>
                <RichTextEditor value={form.assumptions}
                  onChange={(html) => setForm({ ...form, assumptions: html })}
                  placeholder="Conditions assumed true for the causal pathway to hold." />
              </div>
              <div className="field">
                <label className="field-label">Risk Mitigation</label>
                <RichTextEditor value={form.risks_mitigation}
                  onChange={(html) => setForm({ ...form, risks_mitigation: html })} />
              </div>
              <div className="field">
                <label className="field-label">Adaptation Strategy</label>
                <RichTextEditor value={form.adaptation_strategy}
                  onChange={(html) => setForm({ ...form, adaptation_strategy: html })} />
              </div>
              <div className="field">
                <label className="field-label">Gender / Climate Tag</label>
                <TagInput value={form.gender_climate_tag}
                  onChange={(v) => setForm({ ...form, gender_climate_tag: v })}
                  placeholder="gender, climate, youth..." />
              </div>
              {createMutation.isError && (
                <div className="field-error mb-3">{JSON.stringify(createMutation.error?.detail)}</div>
              )}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button"
                  onClick={() => { setAdding(false); setForm(EMPTY_NODE_FORM); }}>
                  <Icon name="x" size={14} /> Cancel
                </button>
                <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={createMutation.isPending}>
                  <Icon name="check" size={14} /> {createMutation.isPending ? "Saving…" : "Save node"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function TheoryOfChange({ projectId, onBack, embedded = false }) {
  const queryClient = useQueryClient();
  const [editingFrame,      setEditingFrame]      = useState(false);
  const [frameForm,         setFrameForm]         = useState({ problem_statement: "", ultimate_outcome: "", status: "draft" });
  const [collapsedSections, setCollapsedSections] = useState({});

  function toggleSection(key) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const { data: toc, isLoading } = useQuery({
    queryKey: ["toc", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/toc/`),
  });

  const frameMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/toc/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["toc", projectId] }); setEditingFrame(false); },
  });

  function onChanged() { queryClient.invalidateQueries({ queryKey: ["toc", projectId] }); }

  function openFrameEdit() {
    setFrameForm({ problem_statement: toc.problem_statement || "", ultimate_outcome: toc.ultimate_outcome || "", status: toc.status });
    setEditingFrame(true);
  }

  if (isLoading) return <div className="loading-wrap"><span className="spinner" /> Loading Theory of Change...</div>;
  if (!toc)      return <div className="view">Not found.</div>;

  const nodesWithToc = toc.nodes.map((n) => ({ ...n, toc: projectId }));
  const isLocked = toc.status === "locked";

  return (
    <div className={embedded ? "" : "view"}>
      {!embedded && <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>← Project</button>}
      {isLocked && (
        <div className="notice notice-warn" style={{ marginBottom: "var(--s-3)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="lock" size={14} style={{ flexShrink: 0 }} />
          <span>
            <strong>Theory of Change is locked.</strong> The project has reached Effective stage (SF-10).
            Structural changes are disabled to preserve the results framework integrity.
          </span>
        </div>
      )}

      {!embedded && (
      <div className="view-header">
        <div className="view-eyebrow text-mono">{toc.project_code}</div>
        <h1 className="view-title">Theory of Change</h1>
        <p className="view-lead">
          Build the causal chain (Activities → Outputs → Outcomes → Impact), then attach
          an indicator to each node — the baseline and targets are defined here, directly on the node.
        </p>
        <div className="row mt-2">
          <span className="badge">{toc.status_display}</span>
          <span className="text-muted text-sm">{toc.project_name}</span>
        </div>
      </div>
      )}

      {/* Frame */}
      <div className="card card-flush mb-3">
        <div className="card-header">
          <div className="row" style={{ gap: 10, alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("frame")}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: "color-mix(in srgb, var(--lime-dark) 14%, transparent)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--lime-dark)" }}>
              <Icon name="target" size={18} />
            </span>
            <div>
              <h2 className="card-title">Frame</h2>
              <div className="card-sub">Problem statement and ultimate outcome (top of the chain)</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {!editingFrame && (
              <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openFrameEdit}>
                <Icon name="pencil" size={14} /> Edit
              </button>
            )}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggleSection("frame")}>
              <Icon name={collapsedSections.frame ? "chevron-down" : "chevron-up"} size={16} />
            </button>
          </div>
        </div>
        {!collapsedSections.frame && (
          <div className="card-body">
            {editingFrame ? (
              <form onSubmit={(e) => { e.preventDefault(); frameMutation.mutate(frameForm); }}>
                <div className="field">
                  <label className="field-label">Status</label>
                  <select className="field-select" value={frameForm.status}
                    onChange={(e) => setFrameForm({ ...frameForm, status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Problem Statement</label>
                  <RichTextEditor value={frameForm.problem_statement}
                    onChange={(html) => setFrameForm({ ...frameForm, problem_statement: html })} />
                </div>
                <div className="field">
                  <label className="field-label">Ultimate Outcome (Impact)</label>
                  <RichTextEditor value={frameForm.ultimate_outcome}
                    onChange={(html) => setFrameForm({ ...frameForm, ultimate_outcome: html })} />
                </div>
                {frameMutation.isError && (
                  <div className="field-error mb-3">{JSON.stringify(frameMutation.error?.detail)}</div>
                )}
                <div className="row">
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={frameMutation.isPending}>
                    <Icon name="check" size={14} /> {frameMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={() => setEditingFrame(false)}>
                    <Icon name="x" size={14} /> Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="dl">
                <div><div className="dl-term">Problem Statement</div><div className="dl-desc"><RichText value={toc.problem_statement} /></div></div>
                <div><div className="dl-term">Ultimate Outcome (Impact)</div><div className="dl-desc"><RichText value={toc.ultimate_outcome} /></div></div>
              </div>
            )}
          </div>
        )}
      </div>

      {LEVELS.map((level) => (
        <LevelSection
          key={level.key}
          level={level}
          nodes={nodesWithToc.filter((n) => n.chain_level === level.key)}
          parentOptions={level.parentKey ? nodesWithToc.filter((n) => n.chain_level === level.parentKey) : []}
          projectId={projectId}
          onChanged={onChanged}
          collapsed={!!collapsedSections[level.key]}
          onToggleCollapse={() => toggleSection(level.key)}
        />
      ))}
    </div>
  );
}

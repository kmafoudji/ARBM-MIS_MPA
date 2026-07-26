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
const FREQ_CHOICES = [
  { value: "quarterly",      label: "Quarterly" },
  { value: "semi_annual",    label: "Semi-annual" },
  { value: "annual",         label: "Annual" },
  { value: "end_of_project", label: "End of project" },
];

function SectionHeader({ icon, title, action }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"8px 0 6px", borderBottom:"1px solid #f0f0ee", marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <Icon name={icon} size={13} style={{ color:"#A4C53F" }} />
        <span style={{ fontSize:11, fontWeight:700, color:"#374151",
          textTransform:"uppercase", letterSpacing:"0.07em" }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

function IndicatorPanel({ projectId, node, onSaved }) {
  const qc = useQueryClient();
  const dialog = useDialog();

  // Modes d'attach
  const [showAttach, setShowAttach]   = useState(false);
  const [search, setSearch]           = useState("");

  // Édition inline baseline
  const [editBaseline, setEditBaseline] = useState(false);
  const [baselineForm, setBaselineForm] = useState({
    baseline_value: "", baseline_year: "", baseline_source: "",
    measurement_frequency: "", notes: "",
  });

  // Édition inline target
  const [addingTarget, setAddingTarget] = useState(false);
  const [targetForm, setTargetForm]     = useState({ target_value: "", target_date: "", label: "" });

  // Désagrégation
  const [showDisagg, setShowDisagg] = useState(false);

  const hasIndicator = !!node.logframe_indicator_code;
  const rowId        = node.logframe_row_id;

  /* ── Queries ── */
  const { data: indicators, isLoading: indLoading } = useQuery({
    queryKey: ["indicators", search],
    queryFn:  () => apiFetch(`/api/results/indicators/?${search ? `q=${encodeURIComponent(search)}` : ""}`),
    enabled: showAttach,
  });

  const { data: existingRow } = useQuery({
    queryKey: ["logframe-row", projectId, rowId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/`),
    enabled: !!rowId,
  });

  const rowTargets = existingRow?.targets || [];
  const currentFreq = existingRow?.measurement_frequency || node.catalogue_frequency || "";
  const disaggDims  = node.catalogue_disagg_dims || [];

  /* ── Mutations ── */
  const attachMutation = useMutation({
    mutationFn: async (selectedId) => {
      const row = await apiFetch(`/api/projects/${projectId}/logframe/`, {
        method: "POST",
        body: JSON.stringify({ indicator: Number(selectedId), chain_level: node.chain_level }),
      });
      await apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, {
        method: "PATCH", body: JSON.stringify({ logframe_row: row.id }),
      });
      // Pré-remplir fréquence depuis catalogue
      if (row.id) {
        const ind = indicators?.find(i => String(i.id) === String(selectedId));
        if (ind?.reporting_frequency) {
          await apiFetch(`/api/projects/${projectId}/logframe/${row.id}/`, {
            method: "PATCH", body: JSON.stringify({ measurement_frequency: ind.reporting_frequency }),
          });
        }
      }
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      qc.invalidateQueries({ queryKey: ["logframe", projectId] });
      setShowAttach(false); setSearch("");
      onSaved();
    },
  });

  const baselineMutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      qc.invalidateQueries({ queryKey: ["logframe-row", projectId, rowId] });
      setEditBaseline(false); onSaved();
    },
  });

  const freqMutation = useMutation({
    mutationFn: (freq) => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/`, {
      method: "PATCH", body: JSON.stringify({ measurement_frequency: freq }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["toc", projectId] });
      qc.invalidateQueries({ queryKey: ["logframe-row", projectId, rowId] });
      onSaved();
    },
  });

  const targetMutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/targets/`, {
      method: "POST", body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logframe-row", projectId, rowId] });
      qc.invalidateQueries({ queryKey: ["logframe", projectId] });
      setTargetForm({ target_value: "", target_date: "", label: "" });
      setAddingTarget(false);
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: (tid) => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/targets/${tid}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logframe-row", projectId, rowId] }),
  });

  const detachMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/toc/nodes/${node.id}/`, {
      method: "PATCH", body: JSON.stringify({ logframe_row: null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["toc", projectId] }); onSaved(); },
  });

  /* ── Render ── */
  return (
    <div style={{ background:"#fafaf8", border:"1px solid #e5e5e2", borderRadius:10,
      padding:"12px 14px", marginTop:10 }}>
      <DialogModal {...dialog.dialogProps} />

      {/* ── En-tête panneau ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af",
          textTransform:"uppercase", letterSpacing:"0.07em" }}>
          <Icon name="bar-chart-2" size={12} style={{ marginRight:5, color:"#A4C53F" }} />
          Indicator &amp; Measurement
        </span>
        <div style={{ display:"flex", gap:5 }}>
          {hasIndicator && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize:10, color:"#dc2626" }}
              onClick={async () => {
                const ok = await dialog.confirm("The logframe row and targets will be preserved.", {
                  title:"Detach indicator?", confirmLabel:"Detach", danger:true,
                });
                if (ok) detachMutation.mutate();
              }}>
              <Icon name="x" size={10} /> Detach
            </button>
          )}
          {!hasIndicator && !showAttach && (
            <button className="btn btn-primary btn-sm" style={{ fontSize:11, gap:5 }}
              onClick={() => setShowAttach(true)}>
              <Icon name="plus" size={12} /> Attach indicator
            </button>
          )}
        </div>
      </div>

      {/* ── Mode : attacher ── */}
      {showAttach && (
        <div style={{ background:"#f0f6dc", border:"1px solid #A4C53F", borderRadius:8,
          padding:12, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:600 }}>Select from LLF2 catalogue</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAttach(false); setSearch(""); }}>
              <Icon name="x" size={11} />
            </button>
          </div>
          <input className="field-input" placeholder="Search by code or keyword…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ marginBottom:8 }} />
          <select className="field-select" style={{ marginBottom:10 }}
            onChange={e => e.target.value && attachMutation.mutate(e.target.value)}
            defaultValue="">
            <option value="">{indLoading ? "Loading…" : "Select an indicator…"}</option>
            {(indicators || []).map(ind => (
              <option key={ind.id} value={ind.id}>
                {ind.code} — {ind.name.slice(0, 65)}
                {ind.reporting_frequency ? ` [${ind.reporting_frequency}]` : ""}
              </option>
            ))}
          </select>
          {attachMutation.isPending && <span className="spinner" style={{ width:14, height:14 }} />}
          {attachMutation.isError && (
            <div className="field-error">{JSON.stringify(attachMutation.error?.detail)}</div>
          )}
        </div>
      )}

      {/* ── Indicateur attaché ── */}
      {hasIndicator && (
        <>
          {/* Identité */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14,
            padding:"8px 10px", background:"#fff", borderRadius:8, border:"1px solid #e5e7eb" }}>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#9ca3af",
              background:"#f3f4f6", padding:"1px 6px", borderRadius:4 }}>
              {node.logframe_indicator_code}
            </span>
            <span style={{ fontSize:13, fontWeight:600, flex:1, color:"#111" }}>
              {node.logframe_indicator_name}
            </span>
            <span style={{ fontSize:11, color:"#9ca3af" }}>({node.logframe_indicator_unit})</span>
          </div>

          {/* ── Section Fréquence & Désagrégation ── */}
          <SectionHeader icon="calendar" title="Frequency & Disaggregation" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div>
              <label className="field-label" style={{ fontSize:11 }}>
                Reporting frequency
                {node.catalogue_frequency && currentFreq !== node.catalogue_frequency && (
                  <span style={{ marginLeft:6, fontSize:10, color:"#9ca3af" }}>
                    (catalogue: {node.catalogue_frequency})
                  </span>
                )}
              </label>
              <select className="field-select" value={currentFreq}
                onChange={e => freqMutation.mutate(e.target.value)}
                disabled={freqMutation.isPending}>
                <option value="">Select…</option>
                {FREQ_CHOICES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              {node.catalogue_frequency && (
                <div style={{ fontSize:10, color:"#9ca3af", marginTop:3 }}>
                  Catalogue default: <strong>{node.catalogue_frequency}</strong>
                </div>
              )}
            </div>
            <div>
              <label className="field-label" style={{ fontSize:11 }}>Disaggregation dimensions</label>
              {disaggDims.length === 0 ? (
                <div style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic" }}>
                  No dimensions in catalogue
                </div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {disaggDims.map(d => (
                    <span key={d.id} style={{ fontSize:11, padding:"2px 8px", borderRadius:99,
                      background:"#f0f6dc", color:"#7a9420", border:"1px solid #A4C53F30" }}>
                      {d.name}
                      {d.categories?.length > 0 && (
                        <span style={{ color:"#9ca3af", marginLeft:4 }}>
                          ({d.categories.slice(0,2).join(", ")}{d.categories.length > 2 ? "…" : ""})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Section Baseline ── */}
          <SectionHeader icon="anchor" title="Baseline"
            action={!editBaseline && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}
                onClick={() => {
                  setBaselineForm({
                    baseline_value:  node.logframe_baseline_value ?? "",
                    baseline_year:   node.logframe_baseline_year  ?? "",
                    baseline_source: existingRow?.baseline_source ?? "",
                    measurement_frequency: currentFreq,
                    notes: existingRow?.notes ?? "",
                  });
                  setEditBaseline(true);
                }}>
                <Icon name="pencil" size={10} /> Edit
              </button>
            )}
          />

          {!editBaseline ? (
            <div style={{ display:"flex", gap:20, fontSize:13, marginBottom:14,
              padding:"8px 10px", background:"#fff", borderRadius:8, border:"1px solid #e5e7eb" }}>
              <div>
                <span style={{ fontSize:11, color:"#9ca3af" }}>Value </span>
                <strong>
                  {node.logframe_baseline_value != null
                    ? `${fmtNum(node.logframe_baseline_value)} ${node.logframe_indicator_unit}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize:11, color:"#9ca3af" }}>Year </span>
                <strong>{node.logframe_baseline_year ?? "—"}</strong>
              </div>
              {existingRow?.baseline_source && (
                <div>
                  <span style={{ fontSize:11, color:"#9ca3af" }}>Source </span>
                  <strong>{existingRow.baseline_source}</strong>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background:"#f0f6dc", border:"1px solid #A4C53F40", borderRadius:8,
              padding:12, marginBottom:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                <div>
                  <label className="field-label" style={{ fontSize:11 }}>
                    Value ({node.logframe_indicator_unit})
                  </label>
                  <input className="field-input" type="number" step="any"
                    value={baselineForm.baseline_value}
                    onChange={e => setBaselineForm(f => ({ ...f, baseline_value: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label" style={{ fontSize:11 }}>Reference year</label>
                  <input className="field-input" type="number" min="2000" max="2050"
                    value={baselineForm.baseline_year}
                    onChange={e => setBaselineForm(f => ({ ...f, baseline_year: e.target.value }))} />
                </div>
                <div style={{ gridColumn:"span 2" }}>
                  <label className="field-label" style={{ fontSize:11 }}>Source / justification</label>
                  <input className="field-input" value={baselineForm.baseline_source}
                    onChange={e => setBaselineForm(f => ({ ...f, baseline_source: e.target.value }))} />
                </div>
                <div style={{ gridColumn:"span 2" }}>
                  <label className="field-label" style={{ fontSize:11 }}>Notes</label>
                  <input className="field-input" value={baselineForm.notes}
                    onChange={e => setBaselineForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditBaseline(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm row" style={{ gap:5 }}
                  onClick={() => baselineMutation.mutate(baselineForm)}
                  disabled={baselineMutation.isPending}>
                  <Icon name="check" size={12} /> Save baseline
                </button>
              </div>
            </div>
          )}

          {/* ── Section Cibles ── */}
          <SectionHeader icon="trending-up" title="Targets"
            action={!addingTarget && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}
                onClick={() => setAddingTarget(true)}>
                <Icon name="plus" size={11} /> Add target
              </button>
            )}
          />

          {/* Liste des cibles */}
          {rowTargets.length === 0 && !addingTarget && (
            <div style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic", marginBottom:10 }}>
              No targets defined yet.
            </div>
          )}
          {rowTargets.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
              {rowTargets.map(t => (
                <div key={t.id} style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"6px 10px", borderRadius:8,
                  background: t.status === "approved" ? "#dcfce7" : t.status === "revised" ? "#f3f4f6" : "#fff",
                  border: `1px solid ${t.status === "approved" ? "#86efac" : "#e5e7eb"}`,
                  textDecoration: t.status === "revised" ? "line-through" : "none",
                }}>
                  {t.is_original_pad && (
                    <span style={{ fontSize:9, fontWeight:700, color:"#1B5A8C",
                      background:"#e0ebf6", padding:"1px 5px", borderRadius:99 }}>PAD</span>
                  )}
                  <span style={{ fontSize:12, color:"#6b7280", minWidth:60 }}>
                    {t.label || (t.target_date ? new Date(t.target_date).getFullYear() : "—")}
                  </span>
                  <span style={{ fontSize:13, fontWeight:700, color:"#111", flex:1 }}>
                    {fmtNum(t.target_value)} <span style={{ fontSize:11, color:"#9ca3af" }}>{node.logframe_indicator_unit}</span>
                  </span>
                  <span style={{ fontSize:10, fontWeight:600,
                    color: t.status === "approved" ? "#16a34a" : t.status === "revised" ? "#9ca3af" : "#d97706" }}>
                    {t.status}
                  </span>
                  {!t.is_original_pad && t.status !== "revised" && (
                    <button style={{ border:"none", background:"none", cursor:"pointer",
                      color:"#dc2626", fontSize:14, padding:"0 2px" }}
                      onClick={async () => {
                        const ok = await dialog.confirm("This target will be permanently deleted.", {
                          title:"Delete target?", confirmLabel:"Delete", danger:true,
                        });
                        if (ok) deleteTargetMutation.mutate(t.id);
                      }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Formulaire ajout cible */}
          {addingTarget && (
            <div style={{ background:"#f0f6dc", border:"1px solid #A4C53F40", borderRadius:8,
              padding:12, marginBottom:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                <div>
                  <label className="field-label" style={{ fontSize:11 }}>
                    Value ({node.logframe_indicator_unit})
                  </label>
                  <input className="field-input" type="number" step="any"
                    value={targetForm.target_value}
                    onChange={e => setTargetForm(f => ({ ...f, target_value: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label" style={{ fontSize:11 }}>Target date</label>
                  <input className="field-input" type="date"
                    value={targetForm.target_date}
                    onChange={e => setTargetForm(f => ({ ...f, target_date: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label" style={{ fontSize:11 }}>Label (optional)</label>
                  <input className="field-input" placeholder="e.g. Year 2, Q4"
                    value={targetForm.label}
                    onChange={e => setTargetForm(f => ({ ...f, label: e.target.value }))} />
                </div>
              </div>
              <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingTarget(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm row" style={{ gap:5 }}
                  onClick={() => targetMutation.mutate(targetForm)}
                  disabled={targetMutation.isPending || !targetForm.target_value || !targetForm.target_date}>
                  <Icon name="check" size={12} /> Add target
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!hasIndicator && !showAttach && (
        <div style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic" }}>
          No indicator attached — click "Attach indicator" to link one from the LLF2 catalogue.
        </div>
      )}
    </div>
  );
}


function NodeCard({ node, projectId, onSaved, onDeleted, readOnly = false }) {
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
            {!readOnly && (
              <>
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={startEdit}>
                  <Icon name="pencil" size={14} /> Edit
                </button>
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button"
                  disabled={deleteMutation.isPending}
                  onClick={async () => { const ok = await dialog.confirm(`All child nodes will also be deleted. This action is irreversible.`, { title: `Delete node ${node.code}?`, confirmLabel: "Delete", danger: true }); if (ok) deleteMutation.mutate(); }}>
                  <Icon name="trash" size={14} /> {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
            {readOnly && (
              <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="lock" size={11} /> Locked at Effective
              </span>
            )}
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
              <NodeCard key={n.id} node={n} projectId={projectId} onSaved={onChanged} onDeleted={onChanged} readOnly={readOnly} />
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
export default function TheoryOfChange({ projectId, onBack, embedded = false, canEdit = true }) {
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

      {embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "10px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="globe" size={16} style={{ color: "#A4C53F" }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Theory of Change</span>
            <span style={{ fontSize: 11, background: "#f0f6dc", color: "#7a9420", padding: "2px 10px", borderRadius: 99, fontWeight: 600 }}>
              {toc.status_display}
            </span>
          </div>
          {isLocked && (
            <span style={{ fontSize: 11, color: "#d97706", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="lock" size={12} /> Locked — structural changes disabled
            </span>
          )}
        </div>
      )}

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
            {!editingFrame && canEdit && (
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
          readOnly={!canEdit}
          collapsed={!!collapsedSections[level.key]}
          onToggleCollapse={() => toggleSection(level.key)}
        />
      ))}
    </div>
  );
}

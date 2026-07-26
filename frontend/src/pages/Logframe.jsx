import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { useDialog, DialogModal } from "../components/Dialog.jsx";
import Icon from "../components/Icon";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";
import DQScoreWidget from "../components/DQScoreWidget";

const CHAIN_LEVEL_ORDER = ["impact", "intermediate_outcome", "immediate_outcome", "output", "activity"];
const CHAIN_LEVEL_LABEL = {
  impact: "Impact",
  intermediate_outcome: "Intermediate Outcome",
  immediate_outcome: "Immediate Outcome",
  output: "Output",
  activity: "Activity",
};
const CHAIN_LEVEL_ICON = {
  impact: "target",
  intermediate_outcome: "layers",
  immediate_outcome: "trending-up",
  output: "package",
  activity: "zap",
};

// ---------------------------------------------------------------------------
// Composant : fiche cible
// ---------------------------------------------------------------------------
function TargetCard({ target, rowId, projectId, onChanged }) {
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(target);

  const updateMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/logframe/${rowId}/targets/${target.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => { setEditing(false); onChanged(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/logframe/${rowId}/targets/${target.id}/`, {
        method: "DELETE",
      }),
    onSuccess: onChanged,
  });

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <input className="field-input" style={{ width: 120 }} type="text" inputMode="decimal"
          value={form.target_value}
          onChange={(e) => { const v=e.target.value; if(v===""||/^-?\d*\.?\d*$/.test(v)) setForm({...form,target_value:v}); }} />
        <input className="field-input" style={{ width: 140 }} type="date"
          value={form.target_date}
          onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
        <input className="field-input" style={{ width: 120 }} placeholder="Label (e.g. Q1 2025)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <button className="btn btn-primary btn-sm row" style={{ gap: 4 }}
          onClick={() => updateMutation.mutate({ target_value: form.target_value, target_date: form.target_date, label: form.label })}
          disabled={updateMutation.isPending}>
          <Icon name="check" size={12} /> Sauver
        </button>
        <button className="btn btn-ghost btn-sm row" style={{ gap: 4 }} onClick={() => setEditing(false)}>
          <Icon name="x" size={12} /> Cancel
        </button>
      </div>
    );
  }

  return (
    <span
      className="badge"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "default" }}
    >
      {target.label && <span className="text-mono" style={{ fontSize: 11 }}>{target.label}</span>}
      <strong>{fmtNum(target.target_value)}</strong>
      <span style={{ color: "var(--muted)", fontSize: 11 }}>
        {new Date(target.target_date).toLocaleDateString("fr-FR")}
      </span>
      <button type="button" onClick={() => { setForm(target); setEditing(true); }}
        style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}>
        <Icon name="pencil" size={11} />
      </button>
      <button type="button"
        onClick={async () => { const ok = await dialog.confirm("This target will be permanently deleted.", { title: "Delete target?", confirmLabel: "Delete", danger: true }); if (ok) deleteMutation.mutate(); }}
        disabled={deleteMutation.isPending}
        style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}>
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Composant : formulaire d'ajout de cible
// ---------------------------------------------------------------------------
function AddTargetForm({ rowId, projectId, unit, onAdded, onCancel }) {
  const [form, setForm] = useState({ target_value: "", target_date: "", label: "", disaggregation_note: "" });

  const mutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/logframe/${rowId}/targets/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => { onAdded(); setForm({ target_value: "", target_date: "", label: "", disaggregation_note: "" }); },
  });

  return (
    <div style={{ marginTop: 8, padding: "var(--s-2)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--r-2)" }}>
      <div className="grid grid-2" style={{ gap: 8 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Target value ({unit})</label>
          <input className="field-input" type="text" inputMode="decimal"
            value={form.target_value}
            onChange={(e) => { const v=e.target.value; if(v===""||/^-?\d*\.?\d*$/.test(v)) setForm({...form,target_value:v}); }} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Deadline</label>
          <input className="field-input" type="date"
            value={form.target_date}
            onChange={(e) => setForm({ ...form, target_date: e.target.value })} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Label (e.g. Q1 2025)</label>
          <input className="field-input" placeholder="Q1 2025, Mid-term, End of project..."
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Disaggregation Note</label>
          <input className="field-input" placeholder="e.g. 60% women, 40% men"
            value={form.disaggregation_note}
            onChange={(e) => setForm({ ...form, disaggregation_note: e.target.value })} />
        </div>
      </div>
      {mutation.isError && <div className="field-error mt-2">{JSON.stringify(mutation.error.detail)}</div>}
      <div className="row mt-2">
        <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
          onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.target_value || !form.target_date}>
          <Icon name="plus" size={13} /> {mutation.isPending ? "Adding..." : "Add target"}
        </button>
        <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onCancel}>
          <Icon name="x" size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant : ligne logframe
// ---------------------------------------------------------------------------
function LogframeRowCard({ row, projectId, onChanged, onOpenPIRS }) {
  const dialog = useDialog();
  const [expanded, setExpanded] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);
  const [editingBaseline, setEditingBaseline] = useState(false);
  const [baselineForm, setBaselineForm] = useState({
    baseline_value: row.baseline_value ?? "",
    baseline_year: row.baseline_year ?? "",
    baseline_source: row.baseline_source ?? "",
    measurement_frequency: row.measurement_frequency ?? "",
    notes: row.notes ?? "",
  });

  const baselineMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/logframe/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => { setEditingBaseline(false); onChanged(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/logframe/${row.id}/`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const directionIcon = row.indicator_direction === "increase" ? "↑" : row.indicator_direction === "decrease" ? "↓" : "→";

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--r-3)", padding: "var(--s-3)" }}>
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start", flex: 1 }}>
          <span className="text-mono badge" style={{ fontSize: 11 }}>{row.indicator_code}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{row.indicator_name}</div>
            <div className="text-muted text-sm row" style={{ gap: 8, marginTop: 2 }}>
              <span>{row.indicator_unit}</span>
              <span>{directionIcon}</span>
              {row.baseline_value != null && (
                <span>Baseline : <strong>{fmtNum(row.baseline_value)}</strong>
                  {row.baseline_year && ` (${row.baseline_year})`}
                </span>
              )}
              {row.targets?.length > 0 && (
                <span>{row.targets.length} target{row.targets.length > 1 ? "s" : ""}</span>
              )}
              {row.toc_node_code && (
                <span className="text-mono" style={{ fontSize: 10 }}>ToC: {row.toc_node_code}</span>
              )}
            </div>
          </div>
        </div>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
      </div>

      {expanded && (
        <div style={{ marginTop: "var(--s-3)" }}>
          {/* Baseline */}
          <div style={{ marginBottom: "var(--s-3)" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span className="card-sub">Reference Value (Baseline)</span>
              {!editingBaseline && (
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={() => setEditingBaseline(true)}>
                  <Icon name="pencil" size={13} /> Edit
                </button>
              )}
            </div>
            {editingBaseline ? (
              <div>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Baseline value ({row.indicator_unit})</label>
                    <input className="field-input" type="text" inputMode="decimal"
                      value={baselineForm.baseline_value}
                      onChange={(e) => { const v=e.target.value; if(v===""||/^-?\d*\.?\d*$/.test(v)) setBaselineForm({...baselineForm,baseline_value:v}); }} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Reference Year</label>
                    <input className="field-input" type="number" min="2000" max="2050"
                      value={baselineForm.baseline_year}
                      onChange={(e) => setBaselineForm({ ...baselineForm, baseline_year: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0, gridColumn: "span 2" }}>
                    <label className="field-label">Baseline Source</label>
                    <input className="field-input"
                      value={baselineForm.baseline_source}
                      onChange={(e) => setBaselineForm({ ...baselineForm, baseline_source: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Measurement Frequency</label>
                    <select className="field-select"
                      value={baselineForm.measurement_frequency}
                      onChange={(e) => setBaselineForm({ ...baselineForm, measurement_frequency: e.target.value })}>
                      <option value="">Select</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="semi_annual">Semi-annual</option>
                      <option value="annual">Annual</option>
                      <option value="end_of_project">End of project</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Notes</label>
                    <input className="field-input"
                      value={baselineForm.notes}
                      onChange={(e) => setBaselineForm({ ...baselineForm, notes: e.target.value })} />
                  </div>
                </div>
                {baselineMutation.isError && <div className="field-error mt-2">{JSON.stringify(baselineMutation.error.detail)}</div>}
                <div className="row mt-2">
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                    onClick={() => baselineMutation.mutate({
                      baseline_value: baselineForm.baseline_value || null,
                      baseline_year: baselineForm.baseline_year || null,
                      baseline_source: baselineForm.baseline_source,
                      measurement_frequency: baselineForm.measurement_frequency || null,
                      notes: baselineForm.notes,
                    })} disabled={baselineMutation.isPending}>
                    <Icon name="check" size={13} /> {baselineMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={() => setEditingBaseline(false)}>
                    <Icon name="x" size={13} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="dl">
                <div><div className="dl-term">Value</div>
                  <div className="dl-desc">{row.baseline_value != null ? `${fmtNum(row.baseline_value)} ${row.indicator_unit}` : "—"}</div>
                </div>
                <div><div className="dl-term">Year</div><div className="dl-desc">{row.baseline_year || "—"}</div></div>
                <div><div className="dl-term">Source</div><div className="dl-desc">{row.baseline_source || "—"}</div></div>
                <div><div className="dl-term">Frequency</div><div className="dl-desc">{row.measurement_frequency_display || "—"}</div></div>
              </div>
            )}
          </div>

          {/* Cibles */}
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span className="card-sub">Targets</span>
              {!addingTarget && (
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={() => setAddingTarget(true)}>
                  <Icon name="plus" size={13} /> Add target
                </button>
              )}
            </div>
            {row.targets?.length === 0 && !addingTarget && (
              <p className="text-muted text-sm" style={{ margin: 0 }}>No targets defined.</p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {row.targets?.map((t) => (
                <TargetCard key={t.id} target={t} rowId={row.id} projectId={projectId} onChanged={onChanged} />
              ))}
            </div>
            {addingTarget && (
              <AddTargetForm
                rowId={row.id} projectId={projectId} unit={row.indicator_unit}
                onAdded={() => { setAddingTarget(false); onChanged(); }}
                onCancel={() => setAddingTarget(false)}
              />
            )}
          </div>

          {/* DQ Score */}
          <div style={{ marginTop: 10 }}>
            <DQScoreWidget projectId={projectId} rowId={row.id} />
          </div>

          {/* Actions */}
          <div style={{ marginTop: "var(--s-3)", borderTop: "1px solid var(--rule)", paddingTop: "var(--s-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {onOpenPIRS && (
              <button className="btn btn-ghost btn-sm row" style={{ gap: 6, color: "#1B5A8C" }}
                onClick={() => onOpenPIRS(row.id)}>
                <Icon name="file-text" size={13} /> View PIRS
              </button>
            )}
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6, color: "var(--rose, #E84A5F)" }}
              onClick={async () => { const ok = await dialog.confirm(`All targets for "${row.indicator_code}" will be lost.`, { title: "Remove from logframe?", confirmLabel: "Remove", danger: true }); if (ok) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}>
              <Icon name="trash" size={13} /> {deleteMutation.isPending ? "Suppression..." : "Remove from logframe"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant : formulaire d'ajout d'une ligne logframe
// ---------------------------------------------------------------------------
// Niveau par defaut selon le type de l'indicateur
function defaultLevel(ind) {
  if (!ind) return "";
  if (ind.indicator_type === "impact") return "impact";
  if (ind.indicator_type === "outcome") return "intermediate_outcome";
  return "output";
}

function AddRowsForm({ projectId, existingIndicatorIds, onAdded, onCancel }) {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // Lignes : [{indicatorId, indicatorLabel, chainLevel}, ...]
  const [lines, setLines] = useState([{ indicatorId: "", indicatorLabel: "", chainLevel: "" }]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  const { data: indicators, isLoading } = useQuery({
    queryKey: ["indicators", search, sectorFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (sectorFilter) params.set("sector", sectorFilter);
      if (typeFilter) params.set("type", typeFilter);
      return apiFetch(`/api/results/indicators/?${params}`);
    },
  });

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
  });

  const { data: choices } = useQuery({
    queryKey: ["logframe-choices", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/choices/`),
  });

  // IDs deja dans le logframe + deja selectionnes dans les autres lignes
  const usedIds = new Set([
    ...existingIndicatorIds,
    ...lines.map((l) => l.indicatorId).filter(Boolean),
  ]);

  function setLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { indicatorId: "", indicatorLabel: "", chainLevel: "" }]);
  }

  function removeLine(idx) {
    setLines((prev) => prev.length === 1 ? [{ indicatorId: "", indicatorLabel: "", chainLevel: "" }] : prev.filter((_, i) => i !== idx));
  }

  function selectIndicator(idx, ind) {
    setLine(idx, {
      indicatorId: String(ind.id),
      indicatorLabel: `${ind.code} — ${ind.name}`,
      chainLevel: defaultLevel(ind),
    });
  }

  async function handleSave() {
    const valid = lines.filter((l) => l.indicatorId && l.chainLevel);
    if (valid.length === 0) return;
    setSaving(true);
    setErrors([]);
    const errs = [];
    for (const line of valid) {
      try {
        await apiFetch(`/api/projects/${projectId}/logframe/`, {
          method: "POST",
          body: JSON.stringify({ indicator: Number(line.indicatorId), chain_level: line.chainLevel }),
        });
      } catch (e) {
        errs.push(`${line.indicatorLabel}: ${JSON.stringify(e.detail)}`);
      }
    }
    setSaving(false);
    setErrors(errs);
    if (errs.length === 0) onAdded();
  }

  const validCount = lines.filter((l) => l.indicatorId && l.chainLevel).length;

  return (
    <div className="card card-flush mb-3">
      <div className="card-header">
        <div>
          <h2 className="card-title">Add indicators to the logframe</h2>
          <div className="card-sub">Select one or more indicators from the LLF2 catalogue</div>
        </div>
        <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onCancel}>
          <Icon name="x" size={14} /> Cancel
        </button>
      </div>

      <div className="card-body">
        {/* Filtres persistants */}
        <div className="grid grid-2" style={{ gap: 8, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Search</label>
            <input className="field-input" placeholder="Code (A001.1) or keyword..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Sector</label>
            <select className="field-select" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
              <option value="">All</option>
              {sectors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Type</label>
            <select className="field-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="output">Output</option>
              <option value="outcome">Outcome</option>
              <option value="impact">Impact</option>
            </select>
          </div>
        </div>

        {/* Tableau multi-lignes */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: "var(--r-3)", overflow: "hidden", marginBottom: 12 }}>
          {/* En-tete */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px 32px",
            gap: 8,
            padding: "6px 12px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--rule)",
            fontSize: 12,
            color: "var(--muted)",
            fontWeight: 600,
          }}>
            <span>Indicator</span>
            <span>Level in the chain</span>
            <span />
          </div>

          {/* Lignes */}
          {lines.map((line, idx) => (
            <div key={idx} style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 32px",
              gap: 8,
              padding: "8px 12px",
              alignItems: "center",
              borderBottom: idx < lines.length - 1 ? "1px solid var(--rule-soft)" : "none",
              background: line.indicatorId ? "var(--lime-pale)" : "transparent",
            }}>
              {/* Select indicateur */}
              <select
                className="field-select"
                style={{ margin: 0 }}
                value={line.indicatorId}
                onChange={(e) => {
                  const ind = indicators?.find((i) => String(i.id) === e.target.value);
                  if (ind) selectIndicator(idx, ind);
                  else setLine(idx, { indicatorId: "", indicatorLabel: "", chainLevel: "" });
                }}
              >
                <option value="">
                  {isLoading ? "Loading..." : "Select an indicator..."}
                </option>
                {indicators?.map((ind) => (
                  <option
                    key={ind.id}
                    value={ind.id}
                    disabled={usedIds.has(String(ind.id)) && String(ind.id) !== line.indicatorId}
                  >
                    {ind.code} — {ind.name.slice(0, 60)}{ind.name.length > 60 ? "..." : ""}
                    {usedIds.has(String(ind.id)) && String(ind.id) !== line.indicatorId ? " (deja ajoute)" : ""}
                  </option>
                ))}
              </select>

              {/* Select niveau */}
              <select
                className="field-select"
                style={{ margin: 0 }}
                value={line.chainLevel}
                onChange={(e) => setLine(idx, { chainLevel: e.target.value })}
              >
                <option value="">Level...</option>
                {choices?.chain_levels?.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              {/* Bouton supprimer la ligne */}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 6px" }}
                onClick={() => removeLine(idx)}
                aria-label="Remove this line"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Erreurs */}
        {errors.map((e, i) => (
          <div key={i} className="field-error" style={{ marginBottom: 4 }}>{e}</div>
        ))}

        {/* Actions */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={addLine}>
            <Icon name="plus" size={13} /> Add row
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onCancel}>
              <Icon name="x" size={13} /> Cancel
            </button>
            <button
              className="btn btn-primary btn-sm row"
              style={{ gap: 6 }}
              onClick={handleSave}
              disabled={validCount === 0 || saving}
            >
              <Icon name="check" size={13} />
              {saving ? "Saving..." : `Save to logframe (${validCount} indicator${validCount !== 1 ? "s" : ""})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page principale Logframe
// ---------------------------------------------------------------------------
export default function Logframe({ projectId, onBack, onOpenPIRS, embedded = false }) {
  const queryClient = useQueryClient();
  const dialog = useDialog();
  // addingRow retiré — les indicateurs s'attachent depuis la ToC

  const { data: rows, isLoading } = useQuery({
    queryKey: ["logframe", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/`),
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/`),
  });

  function onChanged() {
    queryClient.invalidateQueries({ queryKey: ["logframe", projectId] });
  }

  if (isLoading) {
    return (
      <div className="loading-wrap">
        <span className="spinner" /> Chargement du logframe...
      </div>
    );
  }

  // Grouper les lignes par niveau
  const grouped = {};
  CHAIN_LEVEL_ORDER.forEach((level) => { grouped[level] = []; });
  (rows || []).forEach((row) => {
    if (grouped[row.chain_level]) grouped[row.chain_level].push(row);
    else grouped[row.chain_level] = [row];
  });

  return (
    <div className={embedded ? "" : "view"}>
      <DialogModal {...dialog.dialogProps} />
      {!embedded && (
        <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>
          ← Project
        </button>
      )}

      {!embedded && (
      <div className="view-header">
        <div className="view-eyebrow text-mono">{project?.code}</div>
        <h1 className="view-title">Indicator Summary</h1>
        <div className="row mt-2">
          <span className="badge">{(rows || []).length} indicator{rows?.length !== 1 ? "s" : ""}</span>
          <span className="text-muted text-sm">{project?.name}</span>
        </div>
      </div>
      )}

      {embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "10px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="bar-chart-2" size={16} style={{ color: "#A4C53F" }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Logframe — Indicator Summary</span>
            <span style={{ fontSize: 12, background: "#f0f6dc", color: "#7a9420", padding: "2px 10px", borderRadius: 99, fontWeight: 600 }}>
              {(rows || []).length} indicator{rows?.length !== 1 ? "s" : ""}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
            Attach indicators from the Theory of Change tab
          </span>
        </div>
      )}

      <div className="notice notice-info" style={{ marginBottom: 16, fontSize: 13 }}>
        <span style={{ marginRight: 8 }}>ℹ️</span>
        Indicators are attached to nodes directly from the <strong>Theory of Change</strong> screen.
        This view shows a consolidated read-only summary. Baseline and targets can be edited here.
      </div>

      {(rows || []).length === 0 && (
        <div className="card card-flush">
          <div className="card-body">
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No indicators attached yet. Go to <strong>Theory of Change</strong>,
              open a node and click "Attach indicator".
            </p>
          </div>
        </div>
      )}

      {CHAIN_LEVEL_ORDER.map((level) => {
        const levelRows = grouped[level] || [];
        if (levelRows.length === 0) return null;
        return (
          <div key={level} className="card card-flush mb-3">
            <div className="card-header">
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "color-mix(in srgb, var(--lime-dark) 14%, transparent)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "var(--lime-dark)", flexShrink: 0,
                }}>
                  <Icon name={CHAIN_LEVEL_ICON[level] || "target"} size={18} />
                </span>
                <div>
                  <h2 className="card-title">{CHAIN_LEVEL_LABEL[level] || level}</h2>
                  <div className="card-sub">{levelRows.length} indicator{levelRows.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="row" style={{ flexDirection: "column", gap: 10, alignItems: "stretch" }}>
                {levelRows.map((row) => (
                  <LogframeRowCard key={row.id} row={row} projectId={projectId} onChanged={onChanged} onOpenPIRS={onOpenPIRS} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

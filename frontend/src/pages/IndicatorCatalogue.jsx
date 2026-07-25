import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import { useDialog, DialogModal } from "../components/Dialog.jsx";

// Référentiel LLF2 / OCDE DAC — dimensions et catégories standard
const PRESET_DIMENSIONS = [
  { name: "Sex",              categories: ["Male", "Female", "Not specified"] },
  { name: "Age group",        categories: ["<18", "18-35", "36-60", "60+", "Not specified"] },
  { name: "Location type",    categories: ["Urban", "Rural", "Peri-urban", "Not specified"] },
  { name: "Vulnerability",    categories: ["IDP", "Refugee", "Host community", "Non-displaced", "Not specified"] },
  { name: "Disability",       categories: ["With disability", "Without disability", "Not specified"] },
];

function DisaggregationDimensionsPanel({ indicatorId }) {
  const qc = useQueryClient();
  const dialog = useDialog();
  const [adding, setAdding] = useState(false);

  // Formulaire : dimension sélectionnée + catégories cochées + custom
  const EMPTY_FORM = { preset: "", customName: "", selectedCats: [], customCat: "" };
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: dims = [], isLoading } = useQuery({
    queryKey: ["indicator-disagg", indicatorId],
    queryFn:  () => apiFetch(`/api/results/indicators/${indicatorId}/disaggregations/`),
  });

  const addMutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/results/indicators/${indicatorId}/disaggregations/`, {
      method: "POST", body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicator-disagg", indicatorId] });
      setAdding(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (dimId) => apiFetch(`/api/results/indicators/${indicatorId}/disaggregations/${dimId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indicator-disagg", indicatorId] }),
  });

  // Quand on sélectionne un preset → pré-cocher toutes ses catégories
  function selectPreset(name) {
    const preset = PRESET_DIMENSIONS.find(p => p.name === name);
    setForm(f => ({ ...f, preset: name, selectedCats: preset ? [...preset.categories] : [] }));
  }

  function toggleCat(cat) {
    setForm(f => ({
      ...f,
      selectedCats: f.selectedCats.includes(cat)
        ? f.selectedCats.filter(c => c !== cat)
        : [...f.selectedCats, cat],
    }));
  }

  function addCustomCat() {
    const cat = form.customCat.trim();
    if (!cat || form.selectedCats.includes(cat)) return;
    setForm(f => ({ ...f, selectedCats: [...f.selectedCats, cat], customCat: "" }));
  }

  function handleSave() {
    const name = form.preset === "__custom__" ? form.customName.trim() : form.preset;
    if (!name || form.selectedCats.length === 0) return;
    addMutation.mutate({ name, categories: form.selectedCats, order: dims.length });
  }

  const presetCats = PRESET_DIMENSIONS.find(p => p.name === form.preset)?.categories || [];
  const allCats    = form.preset === "__custom__"
    ? form.selectedCats
    : [...new Set([...presetCats, ...form.selectedCats.filter(c => !presetCats.includes(c))])];

  const existingNames = new Set(dims.map(d => d.name));

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <DialogModal {...dialog.dialogProps} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Disaggregation dimensions
        </span>
        {!adding && (
          <button className="btn btn-ghost btn-sm row" style={{ gap: 5, fontSize: 11 }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} /> Add dimension
          </button>
        )}
      </div>

      {isLoading && <span className="spinner" />}

      {dims.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>No disaggregation dimensions configured.</p>
      )}

      {/* Dimensions existantes */}
      {dims.map(dim => (
        <div key={dim.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #f0f0ee" }}>
          <span style={{ fontWeight: 600, fontSize: 12, minWidth: 100, color: "#374151" }}>{dim.name}</span>
          <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {dim.categories.map(cat => (
              <span key={cat} style={{ fontSize: 11, background: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: 99 }}>{cat}</span>
            ))}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", color: "#dc2626", flexShrink: 0 }}
            onClick={async () => {
              const ok = await dialog.confirm(`Remove dimension "${dim.name}" and all its collected values?`, { title: "Remove dimension", confirmLabel: "Remove", danger: true });
              if (ok) deleteMutation.mutate(dim.id);
            }}>
            <Icon name="trash" size={11} />
          </button>
        </div>
      ))}

      {/* Formulaire d'ajout */}
      {adding && (
        <div style={{ background: "#f0f6dc", borderRadius: 10, padding: 14, border: "1px solid #A4C53F", marginTop: 8 }}>

          {/* Sélection de la dimension */}
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Dimension *</label>
            <select className="field-select" value={form.preset}
              onChange={e => selectPreset(e.target.value)}>
              <option value="">Select a dimension…</option>
              {PRESET_DIMENSIONS
                .filter(p => !existingNames.has(p.name))
                .map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              <option value="__custom__">+ Custom dimension…</option>
            </select>
          </div>

          {/* Nom custom */}
          {form.preset === "__custom__" && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Custom dimension name *</label>
              <input className="field-input" placeholder="e.g. Ethnicity, Income level…"
                value={form.customName}
                onChange={e => setForm(f => ({ ...f, customName: e.target.value }))} />
            </div>
          )}

          {/* Catégories */}
          {form.preset && (
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">Categories *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {allCats.map(cat => (
                  <label key={cat} style={{
                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                    background: form.selectedCats.includes(cat) ? "#A4C53F" : "#fff",
                    color: form.selectedCats.includes(cat) ? "#111" : "#374151",
                    border: `1px solid ${form.selectedCats.includes(cat) ? "#7a9420" : "#e5e7eb"}`,
                    borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 500,
                    transition: "all .15s",
                  }}>
                    <input type="checkbox" style={{ display: "none" }}
                      checked={form.selectedCats.includes(cat)}
                      onChange={() => toggleCat(cat)} />
                    {form.selectedCats.includes(cat) && <Icon name="check" size={11} />}
                    {cat}
                  </label>
                ))}
              </div>

              {/* Catégorie custom */}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input className="field-input" style={{ flex: 1 }}
                  placeholder="Add a custom category…"
                  value={form.customCat}
                  onChange={e => setForm(f => ({ ...f, customCat: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomCat())} />
                <button className="btn btn-ghost btn-sm" onClick={addCustomCat}
                  disabled={!form.customCat.trim()}>
                  <Icon name="plus" size={13} />
                </button>
              </div>

              {form.selectedCats.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                  {form.selectedCats.length} categor{form.selectedCats.length > 1 ? "ies" : "y"} selected
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={handleSave}
              disabled={addMutation.isPending || !form.preset || form.selectedCats.length === 0 ||
                (form.preset === "__custom__" && !form.customName.trim())}>
              <Icon name="check" size={12} />
              {addMutation.isPending ? "Saving…" : "Save dimension"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


const DIRECTION_LABEL = {
  increase: "↑ Upward",
  decrease: "↓ Downward",
  neutral: "→ Neutral",
};
const TYPE_COLOR = {
  output:      "badge",
  outcome:     "badge badge-orange",
  impact:      "badge badge-lime",
  numeric:     "badge",
  percentage:  "badge badge-blue",
  yes_no:      "badge badge-violet",
  count:       "badge badge-teal",
};

const AGGREGATION_LABELS = {
  sum:              "Sum",
  average:          "Average",
  weighted_average: "Weighted avg",
  ratio:            "Ratio",
  last_value:       "Last value",
  maximum:          "Maximum",
};

const CCT_COLORS = {
  gender:      { bg: "#fce7f3", color: "#9d174d" },
  climate:     { bg: "#d1fae5", color: "#065f46" },
  youth:       { bg: "#fef3c7", color: "#92400e" },
  disability:  { bg: "#e0e7ff", color: "#3730a3" },
  idp_refugee: { bg: "#fee2e2", color: "#991b1b" },
  equity:      { bg: "#f3e8ff", color: "#6b21a8" },
};

// Champs texte/textarea generiques dans la fiche IRS
const FIELD_ROWS = [
  { key: "definition", label: "Definition", textarea: true },
  { key: "numerator", label: "Numerator", textarea: true },
  { key: "denominator", label: "Denominator", textarea: true },
  { key: "formula", label: "Formula", textarea: true },
  { key: "calculation_method", label: "Calculation method", textarea: true },
  { key: "data_source", label: "Data Sources", textarea: true },
  { key: "collection_method", label: "Collection method", textarea: true },
  { key: "means_of_verification", label: "Means of Verification", textarea: true },
  { key: "assumptions", label: "Assumptions", textarea: true },
  { key: "limitations", label: "Limitations", textarea: true },
];
// unit, disaggregation, responsible -> ComboField (liste deroulante + champ libre)

/**
 * Liste deroulante + champ libre si "Other" est selectionne.
 * choices : tableau de strings. value/onChange : valeur courante.
 */
function ComboField({ label, choices, value, onChange, textarea }) {
  const isOther = value && !choices.includes(value);
  const selectVal = isOther ? "Other" : (value || "");

  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select className="field-select"
        value={selectVal}
        onChange={(e) => {
          if (e.target.value === "Other") onChange("");
          else onChange(e.target.value);
        }}>
        <option value="">Select...</option>
        {choices.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {(selectVal === "Other" || isOther) && (
        <input
          className="field-input"
          style={{ marginTop: 4 }}
          placeholder="Enter a custom value..."
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ligne expandable : fiche IRS en lecture + formulaire d'edition inline
// ---------------------------------------------------------------------------
function IndicatorRow({ ind, isLast, canEdit }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["indicator", ind.id],
    queryFn: () => apiFetch(`/api/results/indicators/${ind.id}/`),
    enabled: expanded,
  });

  const { data: choices } = useQuery({
    queryKey: ["indicator-choices"],
    queryFn: () => apiFetch("/api/results/indicators/choices/"),
    enabled: editing,
  });

  const updateMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/results/indicators/${ind.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indicator", ind.id] });
      queryClient.invalidateQueries({ queryKey: ["indicators"] });
      setEditing(false);
    },
  });

  function startEdit() {
    setForm({ ...detail });
    setEditing(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    updateMutation.mutate(form);
  }

  return (
    <>
      {/* Ligne principale */}
      <div
        onClick={() => { setExpanded(!expanded); setEditing(false); }}
        style={{
          padding: "10px 16px",
          cursor: "pointer",
          borderBottom: "1px solid var(--rule-soft)",
          background: expanded ? "var(--lime-pale)" : "transparent",
          display: "flex", gap: 12, alignItems: "center",
        }}
      >
        <span className="text-mono" style={{ fontSize: 11, color: "var(--muted)", width: 64, flexShrink: 0 }}>
          {ind.code}
        </span>
        <span className={TYPE_COLOR[ind.indicator_type] || "badge"} style={{ fontSize: 10, flexShrink: 0 }}>
          {ind.indicator_type_display}
        </span>
        <span style={{ flex: 1, fontSize: 13 }}>{ind.name}</span>
        <span className="text-muted text-sm" style={{ flexShrink: 0 }}>{ind.unit}</span>
        {ind.chain_level && (
          <span className="badge" style={{ fontSize: 10, flexShrink: 0, opacity: 0.75 }}>
            {ind.chain_level.replace("_", " ")}
          </span>
        )}
        {ind.cross_cutting_tags?.length > 0 && ind.cross_cutting_tags.map((t) => {
          const style = CCT_COLORS[t] || {};
          return <span key={t} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: style.bg, color: style.color, flexShrink: 0 }}>{t}</span>;
        })}
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          style={{ color: "var(--muted)", flexShrink: 0 }}
        />
      </div>

      {/* Fiche inline juste sous la ligne */}
      {expanded && (
        <div style={{
          borderBottom: isLast ? "none" : "1px solid var(--rule)",
          background: "var(--surface)",
          padding: "16px 16px 16px 24px",
        }}>
          {isLoading && <div className="text-muted text-sm"><span className="spinner" /> Loading...</div>}

          {detail && !editing && (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className={TYPE_COLOR[detail.indicator_type] || "badge"}>
                    {detail.indicator_type_display}
                  </span>
                  <span className="text-muted text-sm">{detail.sector_name}</span>
                  {detail.subsector && <span className="text-muted text-sm">· {detail.subsector}</span>}
                  <span className="text-muted text-sm">{DIRECTION_LABEL[detail.direction]}</span>
                </div>
                {canEdit && (
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={(e) => { e.stopPropagation(); startEdit(); }}>
                    <Icon name="pencil" size={13} /> Edit
                  </button>
                )}
              </div>

              <div className="dl">
                {FIELD_ROWS.map(({ key, label }) =>
                  detail[key] ? (
                    <div key={key}>
                      <div className="dl-term">{label}</div>
                      <div className="dl-desc">{detail[key]}</div>
                    </div>
                  ) : null
                )}
                {detail.unit && (
                  <div>
                    <div className="dl-term">Unit of Measure</div>
                    <div className="dl-desc">{detail.unit}</div>
                  </div>
                )}
                {detail.responsible && (
                  <div>
                    <div className="dl-term">Responsible</div>
                    <div className="dl-desc">{detail.responsible}</div>
                  </div>
                )}
                {detail.reporting_frequency_display && (
                  <div>
                    <div className="dl-term">Reporting Frequency</div>
                    <div className="dl-desc">{detail.reporting_frequency_display}</div>
                  </div>
                )}
                {detail.aggregation_rule && (
                  <div>
                    <div className="dl-term">Aggregation rule</div>
                    <div className="dl-desc">{detail.aggregation_rule_display || detail.aggregation_rule}</div>
                  </div>
                )}
                {detail.chain_level && (
                  <div>
                    <div className="dl-term">Chain level</div>
                    <div className="dl-desc">{detail.chain_level_display || detail.chain_level}</div>
                  </div>
                )}
                {detail.cross_cutting_tags?.length > 0 && (
                  <div>
                    <div className="dl-term">Cross-cutting tags</div>
                    <div className="dl-desc row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {detail.cross_cutting_tags.map((t) => {
                        const style = CCT_COLORS[t] || {};
                        return (
                          <span key={t} style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px",
                            borderRadius: 99, background: style.bg, color: style.color,
                          }}>{t}</span>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <div className="dl-term">Version</div>
                  <div className="dl-desc">v{detail.version || 1}</div>
                </div>
              </div>

              {/* SF-6 : dimensions de désagrégation */}
              <DisaggregationDimensionsPanel indicatorId={detail.id} />

              {detail.related_sdg_numbers?.length > 0 && (
                <div className="dl" style={{ marginTop: 12 }}>
                  <div>
                    <div className="dl-term">Related SDGs</div>
                    <div className="dl-desc row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {detail.related_sdg_numbers.map((n) => (
                        <span key={n} className="row" style={{ gap: 4, alignItems: "center" }}>
                          <img src={`/logos/sdg/${n}.png`} alt={`SDG ${n}`} style={{ width: 24, height: 24 }} />
                          <span className="text-sm">SDG {n}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {detail && editing && (
            <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Code</label>
                  <input className="field-input" value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Type</label>
                  <select className="field-select" value={form.indicator_type}
                    onChange={(e) => setForm({ ...form, indicator_type: e.target.value })}>
                    <option value="output">Output</option>
                    <option value="outcome">Outcome</option>
                    <option value="impact">Impact</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Direction</label>
                  <select className="field-select" value={form.direction}
                    onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                    <option value="increase">Upward (+)</option>
                    <option value="decrease">Downward (-)</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Reporting Frequency</label>
                  <select className="field-select" value={form.reporting_frequency || ""}
                    onChange={(e) => setForm({ ...form, reporting_frequency: e.target.value })}>
                    <option value="">Not specified</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semi_annual">Semi-annual</option>
                    <option value="annual">Annual</option>
                    <option value="end_of_project">End of project</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Aggregation rule</label>
                  <select className="field-select" value={form.aggregation_rule || "sum"}
                    onChange={(e) => setForm({ ...form, aggregation_rule: e.target.value })}>
                    <option value="sum">Sum</option>
                    <option value="average">Average</option>
                    <option value="weighted_average">Weighted average</option>
                    <option value="ratio">Ratio</option>
                    <option value="last_value">Last value</option>
                    <option value="maximum">Maximum</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Chain level</label>
                  <select className="field-select" value={form.chain_level || ""}
                    onChange={(e) => setForm({ ...form, chain_level: e.target.value })}>
                    <option value="">Not specified</option>
                    <option value="activity">Activity</option>
                    <option value="output">Output</option>
                    <option value="immediate_outcome">Immediate outcome</option>
                    <option value="intermediate_outcome">Intermediate outcome</option>
                    <option value="ultimate_outcome">Ultimate outcome</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Full Name</label>
                <textarea className="field-textarea" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <ComboField
                label="Unit of Measure"
                choices={choices?.units || []}
                value={form.unit || ""}
                onChange={(v) => setForm({ ...form, unit: v })}
              />

              {FIELD_ROWS.map(({ key, label, textarea }) => (
                <div key={key} className="field">
                  <label className="field-label">{label}</label>
                  {textarea ? (
                    <textarea className="field-textarea" value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  ) : (
                    <input className="field-input" value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  )}
                </div>
              ))}

              <ComboField
                label="Responsible"
                choices={choices?.responsibles || []}
                value={form.responsible || ""}
                onChange={(v) => setForm({ ...form, responsible: v })}
              />

              <div className="field">
                <label className="field-label">Cross-cutting tags</label>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {["gender","climate","youth","disability","idp_refugee","equity"].map((tag) => {
                    const tags = form.cross_cutting_tags || [];
                    const checked = tags.includes(tag);
                    return (
                      <label key={tag} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked ? tags.filter(t => t !== tag) : [...tags, tag];
                            setForm({ ...form, cross_cutting_tags: next });
                          }} />
                        {tag.replace("_", " ")}
                      </label>
                    );
                  })}
                </div>
              </div>

              {updateMutation.isError && (
                <div className="field-error mb-3">{JSON.stringify(updateMutation.error.detail)}</div>
              )}
              <div className="row">
                <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                  type="submit" disabled={updateMutation.isPending}>
                  <Icon name="check" size={13} /> {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }}
                  type="button" onClick={() => setEditing(false)}>
                  <Icon name="x" size={13} /> Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

export default function IndicatorCatalogue() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState("sector"); // "sector" | "flat"
  const [page, setPage] = useState(1);

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

  const canEdit = true;
  const total = indicators?.length ?? 0;

  // Réinitialiser la page quand les filtres changent
  const resetPage = () => setPage(1);

  // Vue plate paginée
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const flatSlice = (indicators || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Vue par secteur : grouper les indicateurs
  const bySector = (indicators || []).reduce((acc, ind) => {
    const key = ind.sector_name || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ind);
    return acc;
  }, {});
  const sectorKeys = Object.keys(bySector).sort();

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · LLF2</div>
        <h1 className="view-title">Indicator Catalogue</h1>
        <p className="view-lead">
          LLF2 institutional library — Agriculture, Health, Infrastructure.
          Maintained by LLFMU only.
        </p>
      </div>

      {/* Filtres + toggle vue */}
      <div className="card card-flush mb-3">
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0, flex: "2 1 200px" }}>
              <label className="field-label">Search</label>
              <input className="field-input" placeholder="Code (A001.1) or keyword..."
                value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: "1 1 140px" }}>
              <label className="field-label">Sector</label>
              <select className="field-select" value={sectorFilter}
                onChange={(e) => { setSectorFilter(e.target.value); resetPage(); }}>
                <option value="">All</option>
                {sectors?.filter(s => !s.parent).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: "1 1 120px" }}>
              <label className="field-label">Type</label>
              <select className="field-select" value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); resetPage(); }}>
                <option value="">All</option>
                <option value="output">Output</option>
                <option value="outcome">Outcome</option>
                <option value="impact">Impact</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
              <button
                className={`btn btn-sm${viewMode === "sector" ? " btn-primary" : " btn-ghost"}`}
                onClick={() => setViewMode("sector")}
                title="Group by sector"
              ><Icon name="layers" size={13} /> By sector</button>
              <button
                className={`btn btn-sm${viewMode === "flat" ? " btn-primary" : " btn-ghost"}`}
                onClick={() => setViewMode("flat")}
                title="Flat list with pagination"
              ><Icon name="list" size={13} /> List</button>
            </div>
          </div>
          <div className="text-muted text-sm" style={{ marginTop: 8 }}>
            {isLoading ? "Loading..." : `${total} indicator${total !== 1 ? "s" : ""}${viewMode === "flat" ? ` · page ${safePage} of ${pageCount}` : ""}`}
          </div>
        </div>
      </div>

      {/* Vue par secteur */}
      {!isLoading && viewMode === "sector" && (
        total === 0
          ? <div className="card card-flush"><div className="text-muted text-sm" style={{ padding: 16 }}>No indicators found.</div></div>
          : sectorKeys.map((sectorName) => (
            <div key={sectorName} className="card card-flush mb-3">
              <div className="card-header" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="bar-chart" size={14} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{sectorName}</span>
                  <span className="badge" style={{ fontSize: 10 }}>{bySector[sectorName].length}</span>
                </div>
              </div>
              <div style={{ padding: 0 }}>
                {bySector[sectorName].map((ind, i) => (
                  <IndicatorRow
                    key={ind.id}
                    ind={ind}
                    isLast={i === bySector[sectorName].length - 1}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          ))
      )}

      {/* Vue plate paginée */}
      {!isLoading && viewMode === "flat" && (
        <div className="card card-flush">
          <div style={{ padding: 0 }}>
            {total === 0 && (
              <div className="text-muted text-sm" style={{ padding: 16 }}>No indicators found.</div>
            )}
            {flatSlice.map((ind, i) => (
              <IndicatorRow
                key={ind.id}
                ind={ind}
                isLast={i === flatSlice.length - 1}
                canEdit={canEdit}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                ← Previous
              </button>
              <span className="text-sm text-muted">Page {safePage} of {pageCount}</span>
              <button className="btn btn-sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="card card-flush">
          <div style={{ padding: 24, textAlign: "center" }}><span className="spinner" /> Loading...</div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import Select from "../components/Select";
import MultiSelect from "../components/MultiSelect";
import { useDialog, DialogModal } from "../components/Dialog.jsx";
import { groupSectorOptions } from "../utils.js";

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
            <label className="field-label" htmlFor="dim-preset">Dimension *</label>
            <Select
              id="dim-preset"
              options={[
                ...PRESET_DIMENSIONS
                  .filter(p => !existingNames.has(p.name))
                  .map(p => ({ value: p.name, label: p.name })),
                { value: "__custom__", label: "+ Custom dimension…" },
              ]}
              value={form.preset}
              onChange={v => selectPreset(v)}
              placeholder="Select a dimension…"
            />
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


/**
 * Logos ODD, servis depuis frontend/public/logos/sdg/<n>.png. `names` est la
 * table numero -> libelle rendue par /api/reference/sdgs/ ; elle peut manquer
 * le temps que la requete revienne, le titre retombe alors sur le numero.
 */
function SdgLogos({ numbers, names = {}, size = 20 }) {
  if (!numbers || numbers.length === 0) return <span className="text-muted text-sm">—</span>;
  return (
    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      {[...numbers].sort((a, b) => a - b).map((n) => (
        <img key={n} src={`/logos/sdg/${n}.png`}
          alt={`SDG ${n}`} title={names[n] ? `SDG ${n} — ${names[n]}` : `SDG ${n}`}
          style={{ width: size, height: size, borderRadius: 3, display: "block" }} />
      ))}
    </span>
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
      <Select
        options={choices.map((c) => ({ value: c, label: c }))}
        value={selectVal}
        onChange={(v) => {
          if (v === "Other") onChange("");
          else onChange(v);
        }}
        placeholder="Select..."
      />
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
// Fiche IRS dans le tiroir : lecture + formulaire d'edition inline
// ---------------------------------------------------------------------------
function IndicatorDrawer({ indicatorId, onClose, canEdit, sdgs = [], sdgName = {} }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["indicator", indicatorId],
    queryFn: () => apiFetch(`/api/results/indicators/${indicatorId}/`),
  });

  const { data: choices } = useQuery({
    queryKey: ["indicator-choices"],
    queryFn: () => apiFetch("/api/results/indicators/choices/"),
    enabled: editing,
  });

  const updateMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/results/indicators/${indicatorId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indicator", indicatorId] });
      queryClient.invalidateQueries({ queryKey: ["indicators"] });
      setEditing(false);
    },
  });

  // Escape ferme le tiroir ; l'edition en cours a la priorite.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (editing) setEditing(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

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
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Indicator sheet">
        <div className="drawer-header">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="drawer-code">{detail?.code || ""}</div>
              <h2 className="drawer-name">{detail?.name || "Loading..."}</h2>
            </div>
            <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          {detail && (
            <div className="drawer-tags">
              <span className="drawer-tag">{typeLabel(detail)}</span>
              <span className="drawer-tag">{detail.sector_name}</span>
              {detail.subsector && <span className="drawer-tag">{detail.subsector}</span>}
              <span className="drawer-tag">{DIRECTION_LABEL[detail.direction]}</span>
              <span className="drawer-tag">v{detail.version || 1}</span>
              <span className="drawer-sdgs">
                <span className="drawer-sdgs-label">SDGs</span>
                <SdgLogos numbers={detail.related_sdg_numbers} names={sdgName} size={22} />
              </span>
            </div>
          )}
        </div>

        <div className="drawer-body">
          {isLoading && <div className="text-muted text-sm"><span className="spinner" /> Loading...</div>}

          {detail && !editing && (
            <>
              <div className="drawer-note row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  Institutional codebook (POL-2.01): the definition, the method and the
                  disaggregation are the same for every project — only baselines and
                  targets vary.
                </span>
                {canEdit && (
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={startEdit}>
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
              </div>

              {/* SF-6 : dimensions de désagrégation */}
              <DisaggregationDimensionsPanel indicatorId={detail.id} />

            </>
          )}

          {detail && editing && (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Code</label>
                  <input className="field-input" value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-type">Type</label>
                  <Select
                    id="ind-type"
                    options={[
                      { value: "output", label: "Output" },
                      { value: "outcome", label: "Outcome" },
                      { value: "impact", label: "Impact" },
                    ]}
                    value={form.indicator_type}
                    onChange={(v) => setForm({ ...form, indicator_type: v })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-direction">Direction</label>
                  <Select
                    id="ind-direction"
                    options={[
                      { value: "increase", label: "Upward (+)" },
                      { value: "decrease", label: "Downward (-)" },
                      { value: "neutral", label: "Neutral" },
                    ]}
                    value={form.direction}
                    onChange={(v) => setForm({ ...form, direction: v })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-frequency">Reporting Frequency</label>
                  <Select
                    id="ind-frequency"
                    options={[
                      { value: "monthly", label: "Monthly" },
                      { value: "quarterly", label: "Quarterly" },
                      { value: "semi_annual", label: "Semi-annual" },
                      { value: "annual", label: "Annual" },
                      { value: "end_of_project", label: "End of project" },
                    ]}
                    value={form.reporting_frequency || ""}
                    onChange={(v) => setForm({ ...form, reporting_frequency: v })}
                    placeholder="Not specified"
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-aggregation">Aggregation rule</label>
                  <Select
                    id="ind-aggregation"
                    options={[
                      { value: "sum", label: "Sum" },
                      { value: "average", label: "Average" },
                      { value: "weighted_average", label: "Weighted average" },
                      { value: "ratio", label: "Ratio" },
                      { value: "last_value", label: "Last value" },
                      { value: "maximum", label: "Maximum" },
                    ]}
                    value={form.aggregation_rule || "sum"}
                    onChange={(v) => setForm({ ...form, aggregation_rule: v })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-chain-level">Chain level</label>
                  <Select
                    id="ind-chain-level"
                    options={[
                      { value: "activity", label: "Activity" },
                      { value: "output", label: "Output" },
                      { value: "immediate_outcome", label: "Immediate outcome" },
                      { value: "intermediate_outcome", label: "Intermediate outcome" },
                      { value: "ultimate_outcome", label: "Ultimate outcome" },
                    ]}
                    value={form.chain_level || ""}
                    onChange={(v) => setForm({ ...form, chain_level: v })}
                    placeholder="Not specified"
                  />
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
                <label className="field-label" htmlFor="ind-sdgs">SDGs</label>
                <MultiSelect
                  id="ind-sdgs"
                  placeholder="Search SDGs..."
                  options={sdgs.map((s) => ({ value: s.number, label: `SDG ${s.number} — ${s.name}` }))}
                  value={form.related_sdg_numbers || []}
                  onChange={(v) => setForm({ ...form, related_sdg_numbers: v })}
                />
              </div>

              <div className="field">
                <label className="field-label">Cross-cutting tags</label>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {CCT_TAGS.map((tag) => {
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
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Explorateur : onglets par secteur, chips de filtre, grille de fiches
// ---------------------------------------------------------------------------

// Les couleurs de `Sector.color` en base datent de l'ere lime et sortent de la
// palette LLF (docs/design.md) : on remappe par pilier sur les tokens.
const PILLAR_TOKEN = {
  INFRA: "var(--sec-climate)",
  SOC:   "var(--sec-health)",
  RES:   "var(--sec-agri)",
};
const DEFAULT_SECTOR_TOKEN = "var(--muted)";

// Ordre d'affichage des sections d'un onglet (BRQ-2.02).
const TYPE_ORDER = ["impact", "outcome", "output", "numeric", "percentage", "yes_no", "count"];
// Les donnees portent output/outcome/impact, absents de INDICATOR_TYPE_CHOICES :
// get_indicator_type_display renvoie alors la valeur brute, en minuscules.
const TYPE_LABELS = {
  impact:     "Impact",
  outcome:    "Outcome",
  output:     "Output",
  numeric:    "Numeric",
  percentage: "Percentage",
  yes_no:     "Yes / No",
  count:      "Count",
};
const typeLabel = (ind) =>
  TYPE_LABELS[ind.indicator_type] || ind.indicator_type_display || ind.indicator_type;

const CCT_TAGS = ["gender", "climate", "youth", "disability", "idp_refugee", "equity"];
// Onglets transversaux demandes en plus des secteurs. `cct:all` est leur
// entree de groupe, comme "All <pilier>" pour un pilier.
const CCT_TABS = [
  { key: "cct:all",     tags: ["gender", "climate"], label: "Cross-cutting", title: "Gender and climate" },
  { key: "cct:gender",  tags: ["gender"],  label: "Gender",  title: "Gender" },
  { key: "cct:climate", tags: ["climate"], label: "Climate", title: "Climate adaptation" },
];

// Les noms de pilier sont trop longs pour une barre compacte ; le nom complet
// reste dans le `title` de l'onglet.
const PILLAR_SHORT = {
  INFRA: "Infrastructure",
  SOC:   "Human capital",
  RES:   "Resilience",
};

const CHAIN_LEVEL_LABELS = {
  activity:             "Activity",
  output:               "Output",
  immediate_outcome:    "Immediate outcome",
  intermediate_outcome: "Intermediate outcome",
  ultimate_outcome:     "Ultimate outcome",
};

/** Chips de filtre additifs : un ensemble vide ne filtre rien. */
function ChipGroup({ label, values, selected, onToggle, labelFor }) {
  if (values.length < 2) return null;
  return (
    <>
      <span className="filter-chip-label">{label}</span>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={`filter-chip${selected.includes(v) ? " on" : ""}`}
          onClick={() => onToggle(v)}
        >
          {labelFor ? labelFor(v) : v}
        </button>
      ))}
      <span className="filter-chip-sep" />
    </>
  );
}

export default function IndicatorCatalogue() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(null);
  const [typeChips, setTypeChips] = useState([]);
  const [levelChips, setLevelChips] = useState([]);
  const [subChips, setSubChips] = useState([]);
  const [openId, setOpenId] = useState(null);

  const { data: indicators, isLoading } = useQuery({
    queryKey: ["indicators", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      return apiFetch(`/api/results/indicators/?${params}`);
    },
  });

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
  });

  const { data: sdgs } = useQuery({
    queryKey: ["sdgs"],
    queryFn: () => apiFetch("/api/reference/sdgs/"),
  });

  const canEdit = true;
  const all = useMemo(() => indicators || [], [indicators]);

  // --- Onglets : pilier -> "All <pilier>" + ses secteurs (ADR 0007) --------
  const pillarGroups = useMemo(() => {
    const bySeq = (a, b) => (a.sequence || 0) - (b.sequence || 0) || a.name.localeCompare(b.name);
    return groupSectorOptions(sectors)
      .sort((a, b) => bySeq(a[0], b[0]))
      .map(([pillar, children]) => ({
        pillar,
        color: PILLAR_TOKEN[pillar.code] || DEFAULT_SECTOR_TOKEN,
        // Le premier onglet est l'entree du groupe : le pilier entier.
        tabs: [
          {
            key: `p:${pillar.id}`,
            label: PILLAR_SHORT[pillar.code] || pillar.name,
            title: `All ${pillar.name}`,
            sectorIds: [pillar.id, ...children.map((c) => c.id)],
          },
          ...[...children].sort(bySeq).map((c) => ({ key: `s:${c.id}`, label: c.name, title: c.name, sectorIds: [c.id] })),
        ],
      }));
  }, [sectors]);

  const sectorColor = useMemo(() => {
    const map = {};
    for (const { pillar, color, tabs } of pillarGroups) {
      map[pillar.id] = color;
      for (const t of tabs) for (const id of t.sectorIds) map[id] = color;
    }
    return map;
  }, [pillarGroups]);

  const countFor = (t) =>
    t.tags
      ? all.filter((i) => t.tags.some((tag) => (i.cross_cutting_tags || []).includes(tag))).length
      : all.filter((i) => t.sectorIds.includes(i.sector)).length;

  // Onglet par defaut : celui qui porte le plus d'indicateurs.
  const firstTab = pillarGroups[0]?.tabs[0]?.key;
  const defaultTab = useMemo(() => {
    let best = null, bestN = -1;
    for (const g of pillarGroups) {
      for (const t of g.tabs) {
        if (t.key.startsWith("p:")) continue;
        const n = countFor(t);
        if (n > bestN) { best = t.key; bestN = n; }
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillarGroups, all]);

  const activeKey = tab || defaultTab || firstTab;
  const activeTab = useMemo(() => {
    const cct = CCT_TABS.find((t) => t.key === activeKey);
    if (cct) return cct;
    for (const g of pillarGroups) {
      const t = g.tabs.find((x) => x.key === activeKey);
      if (t) return t;
    }
    return null;
  }, [activeKey, pillarGroups]);

  // --- Contenu de l'onglet ------------------------------------------------
  const tabItems = useMemo(() => {
    if (!activeTab) return [];
    if (activeTab.tags) {
      return all.filter((i) => activeTab.tags.some((t) => (i.cross_cutting_tags || []).includes(t)));
    }
    return all.filter((i) => activeTab.sectorIds.includes(i.sector));
  }, [all, activeTab]);

  const uniq = (list) => [...new Set(list.filter(Boolean))];
  const typeValues  = useMemo(() => uniq(tabItems.map((i) => i.indicator_type))
    .sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)), [tabItems]);
  const levelValues = useMemo(() => uniq(tabItems.map((i) => i.chain_level)).sort(), [tabItems]);
  const subValues   = useMemo(() => uniq(tabItems.map((i) => i.subsector)).sort(), [tabItems]);

  const items = useMemo(() => tabItems.filter((i) =>
    (typeChips.length  === 0 || typeChips.includes(i.indicator_type)) &&
    (levelChips.length === 0 || levelChips.includes(i.chain_level)) &&
    (subChips.length   === 0 || subChips.includes(i.subsector))
  ), [tabItems, typeChips, levelChips, subChips]);

  // Sections : type d'indicateur, puis ODS (a defaut le sous-secteur).
  const sdgName = useMemo(() => {
    const map = {};
    for (const s of sdgs || []) map[s.number] = s.name;
    return map;
  }, [sdgs]);

  // Sections : type d'indicateur, puis sous-secteur. Pas de regroupement par
  // ODD : un indicateur en porte souvent plusieurs et sortait autant de fois.
  // Les ODD restent sur la fiche, en logo.
  const sections = useMemo(() => {
    const byType = new Map();
    for (const ind of items) {
      if (!byType.has(ind.indicator_type)) byType.set(ind.indicator_type, new Map());
      const groups = byType.get(ind.indicator_type);
      const key = ind.subsector || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ind);
    }
    return [...byType.entries()]
      .sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
      .map(([type, groups]) => ({
        type,
        label: TYPE_LABELS[type] || type,
        groups: [...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, rows]) => ({ key: key || "_", label: key, rows })),
        count: [...groups.values()].reduce((n, g) => n + g.length, 0),
      }));
  }, [items]);

  // Couleur de l'onglet actif : elle habille les barres de section.
  const tabColor = activeTab?.tags
    ? "var(--sec-women)"
    : (sectorColor[activeTab?.sectorIds?.[activeTab.sectorIds.length - 1]] || DEFAULT_SECTOR_TOKEN);

  const withSdg  = items.filter((i) => i.related_sdg_numbers?.length > 0).length;
  const noLevel  = items.filter((i) => !i.chain_level).length;

  function selectTab(key) {
    setTab(key);
    setTypeChips([]); setLevelChips([]); setSubChips([]);
    setOpenId(null);
  }
  const toggle = (setter) => (v) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · LLF2</div>
        <h1 className="view-title">Indicator Catalogue</h1>
        <p className="view-lead">
          The central codebook every project selects from — same definition, same
          method, same disaggregation; only baselines and targets vary by project.
          Maintained by LLFMU only.
        </p>
      </div>

      {/* Recherche : elle porte sur tout le catalogue, pas sur l'onglet seul */}
      <div className="card card-flush mb-3">
        <div className="card-body">
          <div className="field" style={{ marginBottom: 0, maxWidth: 420 }}>
            <label className="field-label">Search</label>
            <input className="field-input" placeholder="Code (A001.1) or keyword..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="text-muted text-sm" style={{ marginTop: 8 }}>
            {isLoading ? "Loading..." : `${all.length} indicator${all.length !== 1 ? "s" : ""} in the catalogue`}
          </div>
        </div>
      </div>

      {/* Onglets sur une seule ligne : un pilier par pastille ; les secteurs du
          pilier actif se deplient a sa suite, les autres restent replies. */}
      <div className="cat-tabbar">
        {[...pillarGroups.map(({ pillar, color, tabs }) => ({ id: `p${pillar.id}`, color, tabs })),
          { id: "cct", color: "var(--sec-women)", tabs: CCT_TABS }].map((group) => {
          const open = group.tabs.some((t) => t.key === activeKey);
          const shown = open ? group.tabs : group.tabs.slice(0, 1);
          return (
            <span key={group.id} className="cat-tabgroup" style={{ "--tab-color": group.color }}>
              {shown.map((t, i) => {
                const n = countFor(t);
                return (
                  <button key={t.key} title={t.title || t.label}
                    className={`cat-tab${activeKey === t.key ? " active" : ""}`
                      + (i === 0 ? " lead" : "") + (n === 0 ? " empty" : "")}
                    onClick={() => selectTab(t.key)}>
                    {t.label}<span className="cat-tab-count">{n}</span>
                  </button>
                );
              })}
            </span>
          );
        })}
      </div>

      {/* KPI de l'onglet */}
      <div className="kpi-strip mb-3">
        <div className="kpi">
          <div className="kpi-label">Indicators</div>
          <div className="kpi-value">{items.length}</div>
          <div className="kpi-extra">{activeTab?.title || activeTab?.label || ""}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sub-sectors</div>
          <div className="kpi-value">{uniq(items.map((i) => i.subsector)).length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">With an SDG</div>
          <div className="kpi-value">{withSdg}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">No chain level</div>
          <div className="kpi-value">{noLevel}</div>
        </div>
      </div>

      {/* Chips */}
      <div className="filter-chips mb-3">
        <ChipGroup label="Type" values={typeValues} selected={typeChips}
          onToggle={toggle(setTypeChips)}
          labelFor={(v) => TYPE_LABELS[v] || v} />
        <ChipGroup label="Chain level" values={levelValues} selected={levelChips}
          onToggle={toggle(setLevelChips)}
          labelFor={(v) => CHAIN_LEVEL_LABELS[v] || v} />
        <ChipGroup label="Sub-sector" values={subValues} selected={subChips}
          onToggle={toggle(setSubChips)} />
        <span className="text-muted text-sm">{items.length} shown</span>
      </div>

      {/* Grille */}
      {isLoading && (
        <div className="card card-flush">
          <div style={{ padding: 24, textAlign: "center" }}><span className="spinner" /> Loading...</div>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="card card-flush">
          <div className="text-muted text-sm" style={{ padding: 16 }}>
            {activeTab?.tags
              ? `No indicator carries the ${activeTab.tags.join(" or ")} tag yet — tag them from the indicator sheet.`
              : "No indicator matches the current filters."}
          </div>
        </div>
      )}

      {!isLoading && sections.map((sec) => (
        <div key={sec.type} className="cat-section">
          <div className="cat-section-bar" style={{ background: tabColor }}>
            {sec.label}<span className="count">{sec.count}</span>
          </div>
          {sec.groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <div className="cat-group-title">
                  {group.label}
                  <span className="count">{group.rows.length}</span>
                </div>
              )}
              <div className="ind-grid">
                {group.rows.map((ind) => (
                  <button key={ind.id} type="button"
                    className={`ind-card${openId === ind.id ? " open" : ""}`}
                    style={{ borderLeftColor: sectorColor[ind.sector] || DEFAULT_SECTOR_TOKEN }}
                    onClick={() => setOpenId(ind.id)}>
                    <div className="ind-card-top">
                      <span className="ind-card-code" style={{ color: sectorColor[ind.sector] || DEFAULT_SECTOR_TOKEN }}>
                        {ind.code}
                      </span>
                      <span className={TYPE_COLOR[ind.indicator_type] || "badge"} style={{ fontSize: 10, marginLeft: "auto" }}>
                        {typeLabel(ind)}
                      </span>
                    </div>
                    <div className="ind-card-name">{ind.name}</div>
                    <div className="ind-card-meta">
                      {ind.subsector && <span>{ind.subsector}</span>}
                      {ind.unit && <span>{ind.unit}</span>}
                      {ind.chain_level && <span>{CHAIN_LEVEL_LABELS[ind.chain_level] || ind.chain_level}</span>}
                      {(ind.cross_cutting_tags || []).map((t) => {
                        const style = CCT_COLORS[t] || {};
                        return <span key={t} style={{ background: style.bg, color: style.color }}>{t.replace("_", " ")}</span>;
                      })}
                    </div>
                    {ind.related_sdg_numbers?.length > 0 && (
                      <div className="ind-card-sdgs">
                        <SdgLogos numbers={ind.related_sdg_numbers} names={sdgName} size={18} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {openId && (
        <IndicatorDrawer indicatorId={openId} canEdit={canEdit} sdgs={sdgs || []} sdgName={sdgName}
          onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

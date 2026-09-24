import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import Select from "../components/Select";
import MultiSelect from "../components/MultiSelect";
import SectorIcon from "../components/SectorIcon";
import ProjectTypeFilter, { useProjectType } from "../components/ProjectTypeFilter.jsx";
import { useDialog, DialogModal } from "../components/Dialog.jsx";
import { groupSectorOptions, RESULT_LEVEL_COLOR, sectorOptions } from "../utils.js";

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
        <span style={{ fontWeight: 700, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
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
        <p style={{ fontSize: 12, color: "var(--subtle)", margin: 0 }}>No disaggregation dimensions configured.</p>
      )}

      {/* Dimensions existantes */}
      {dims.map(dim => (
        <div key={dim.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "8px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--rule)" }}>
          <span style={{ fontWeight: 600, fontSize: 12, minWidth: 100, color: "var(--ink-soft)" }}>{dim.name}</span>
          <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {dim.categories.map(cat => (
              <span key={cat} style={{ fontSize: 11, background: "var(--violet-soft)", color: "var(--violet-darker)", padding: "2px 8px", borderRadius: 99 }}>{cat}</span>
            ))}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", color: "var(--rose)", flexShrink: 0 }}
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
        <div style={{ background: "var(--lime-pale)", borderRadius: 10, padding: 14, border: "1px solid var(--lime)", marginTop: 8 }}>

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
                    background: form.selectedCats.includes(cat) ? "var(--lime)" : "var(--paper)",
                    color: form.selectedCats.includes(cat) ? "var(--ink)" : "var(--ink-soft)",
                    border: `1px solid ${form.selectedCats.includes(cat) ? "var(--lime-darker)" : "var(--rule)"}`,
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
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
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
  project_specific: "badge badge-rose",
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
  gender:      { bg: "var(--sec-women-pale)", color: "var(--rose)" },
  climate:     { bg: "var(--lime-pale)", color: "var(--lime-darker)" },
  youth:       { bg: "var(--sec-infra-pale)", color: "var(--orange-darker)" },
  disability:  { bg: "var(--violet-soft)", color: "var(--violet-darker)" },
  idp_refugee: { bg: "var(--rose-soft)", color: "var(--rose-darker)" },
  equity:      { bg: "var(--sec-women-pale)", color: "var(--violet)" },
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
// Fiche IRS en lecture — le corps deplie d'une ligne d'indicateur
// ---------------------------------------------------------------------------
function IndicatorSheet({ detail, canEdit, onEdit }) {
  return (
    <>
        <div className="drawer-note row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>
            Institutional codebook: the definition, the method and the
            disaggregation are the same for every project — only baselines and
            targets vary.
          </span>
          {canEdit && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={onEdit}>
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
  );
}

// ---------------------------------------------------------------------------
// Ligne d'indicateur : une ligne repliee, la fiche dessous quand on l'ouvre
// ---------------------------------------------------------------------------
function IndicatorRow({ ind, expanded, onToggle, onEdit, sdgName, color, canEdit }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["indicator", ind.id],
    queryFn: () => apiFetch(`/api/results/indicators/${ind.id}/`),
    enabled: expanded,
  });

  return (
    <div className={`ind-row${expanded ? " open" : ""}`} style={{ borderLeftColor: color }}>
      <button type="button" className="ind-row-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="ind-row-code" style={{ color }}>{ind.code}</span>
        <span className={TYPE_COLOR[ind.indicator_type] || "badge"} style={{ fontSize: 10, flexShrink: 0 }}>
          {typeLabel(ind)}
        </span>
        <span className="ind-row-name">{ind.name}</span>
        {ind.unit && <span className="ind-row-unit">{ind.unit}</span>}
        {(ind.cross_cutting_tags || []).map((t) => {
          const style = CCT_COLORS[t] || {};
          return (
            <span key={t} className="ind-row-tag" style={{ background: style.bg, color: style.color }}>
              {t.replace("_", " ")}
            </span>
          );
        })}
        {ind.related_sdg_numbers?.length > 0 && (
          <SdgLogos numbers={ind.related_sdg_numbers} names={sdgName} size={17} />
        )}
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} />
      </button>

      {expanded && (
        <div className="ind-row-body">
          {isLoading && <div className="text-muted text-sm"><span className="spinner" /> Loading...</div>}
          {detail && <IndicatorSheet detail={detail} canEdit={canEdit} onEdit={() => onEdit(ind.id)} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiroir d'edition : la fiche se lit dans la ligne, le formulaire ici, ou il a
// la place de deux colonnes.
// ---------------------------------------------------------------------------
function IndicatorDrawer({ indicatorId, onClose, sdgs = [], sdgName = {}, projectType = "llf" }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["indicator", indicatorId],
    queryFn: () => apiFetch(`/api/results/indicators/${indicatorId}/`),
  });

  const { data: choices } = useQuery({
    queryKey: ["indicator-choices"],
    queryFn: () => apiFetch("/api/results/indicators/choices/"),
  });

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
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
      onClose();
    },
  });

  // Le formulaire part de la fiche des qu'elle arrive.
  useEffect(() => { if (detail && !form) setForm({ ...detail }); }, [detail, form]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    updateMutation.mutate(form);
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Edit indicator">
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
              {/* Le secteur de la classification affichee d'abord (ADR 0014). */}
              {[
                { key: "llf", name: detail.llf_sector_name, label: "LLF" },
                { key: "isdb", name: detail.sector_name, label: "IsDB" },
              ]
                .sort((a, b) => Number(b.key === projectType) - Number(a.key === projectType))
                .filter((t) => t.name)
                .map((t) => (
                  <span key={t.key} className="drawer-tag" title={`${t.label} sector`}>{t.label} · {t.name}</span>
                ))}
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

          {detail && form && (
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
                {/* Deux classifications independantes (ADR 0014) : le secteur
                    IsDB est obligatoire, le secteur LLF seulement pour les
                    indicateurs du Fonds. */}
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-sector">IsDB sector</label>
                  <Select
                    id="ind-sector"
                    options={sectorOptions(sectors, { taxonomy: "isdb", stringIds: true, activeOnly: false })}
                    value={form.sector == null ? "" : String(form.sector)}
                    onChange={(v) => setForm({ ...form, sector: v ? Number(v) : null })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="ind-llf-sector">LLF sector</label>
                  <Select
                    id="ind-llf-sector"
                    placeholder="Not an LLF indicator"
                    options={sectorOptions(sectors, { taxonomy: "llf", stringIds: true, activeOnly: false })}
                    value={form.llf_sector == null ? "" : String(form.llf_sector)}
                    onChange={(v) => setForm({ ...form, llf_sector: v ? Number(v) : null })}
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
                  type="button" onClick={onClose}>
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
// Une teinte par pilier, celle de son secteur dominant (docs/design.md,
// mapping fixe) : bleu, corail, vert, et violet pour le transversal.
// "All indicators" n'est pas un pilier et ne doit concourir avec aucun : il
// reste neutre, en gris de la gamme charbon sur carte blanche.
const PILLAR_TOKEN = {
  INFRA: "var(--sec-climate)",
  SOC:   "var(--sec-health)",
  RES:   "var(--sec-agri)",
};
// Fond des cartes : le niveau L5 de la meme teinte (design.md §2.2), pas une
// nuance inventee.
const PILLAR_PALE = {
  INFRA: "var(--sec-climate-pale)",
  SOC:   "var(--sec-health-pale)",
  RES:   "var(--sec-agri-pale)",
};
const DEFAULT_SECTOR_TOKEN = "var(--muted)";
// Les secteurs LLF (ADR 0014) sont les trois teintes sectorielles de
// docs/design.md, a l'identique de `Sector.color`.
const LLF_TOKEN = {
  LLF_HEALTH: "var(--sec-health)",
  LLF_AGRI:   "var(--sec-agri)",
  LLF_SOCINF: "var(--sec-infra)",
};
const LLF_PALE = {
  LLF_HEALTH: "var(--sec-health-pale)",
  LLF_AGRI:   "var(--sec-agri-pale)",
  LLF_SOCINF: "var(--sec-infra-pale)",
};

// Ordre d'affichage des sections d'un onglet (BRQ-2.02).
// `project_specific` ferme la liste : les sections institutionnelles d'abord,
// les indicateurs apportes par un projet en bloc a la fin.
const TYPE_ORDER = ["impact", "outcome", "output", "numeric", "percentage",
                    "yes_no", "count", "project_specific"];
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
  project_specific: "Project-specific",
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

// Entree "tout le catalogue" : premier groupe de la barre, onglet par defaut,
// et le seul moyen de lever le filtre de secteur.
const ALL_TAB = { key: "all", label: "All indicators", title: "The whole catalogue", all: true };

// Pictogramme de chaque entree de la premiere rangee. Les piliers portent bien
// un `icon` en base, mais deux valent "generic" : le choix se fait ici.
const GROUP_ICON = {
  all:   "generic",
  INFRA: "infrastructure",
  SOC:   "education",
  RES:   "agriculture",
  cct:   "gender",
};

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
  // Plusieurs lignes peuvent rester ouvertes ; le tiroir ne sert qu'a editer.
  const [openIds, setOpenIds] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  // Deux classifications (ADR 0014) : LLF lit `llf_sector`, IsDB `sector`.
  const [projectType, setProjectTypeState] = useProjectType();
  const sectorField = projectType === "llf" ? "llf_sector" : "sector";
  function setProjectType(value) {
    setProjectTypeState(value);
    setTab(null);
    setTypeChips([]); setLevelChips([]); setSubChips([]);
    setOpenIds(new Set());
  }

  const { data: indicators, isLoading } = useQuery({
    queryKey: ["indicators", projectType, search],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("taxonomy", projectType);
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
  // Deux rangees : les groupes (tout / les piliers / le transversal) en haut,
  // les entrees du groupe actif en dessous. `lead` est l'entree du groupe
  // elle-meme — "tout le pilier" — et sert de bouton pour lever le filtre de
  // secteur sans quitter le pilier.
  const tabGroups = useMemo(() => {
    const bySeq = (a, b) => (a.sequence || 0) - (b.sequence || 0) || a.name.localeCompare(b.name);
    // LLF est plate : une carte par secteur, sans seconde rangee.
    const llf = (sectors || [])
      .filter((s) => s.taxonomy === "llf" && s.is_active !== false)
      .sort(bySeq)
      .map((sector) => ({
        id: `l${sector.id}`,
        pillar: sector,
        color: LLF_TOKEN[sector.code] || sector.color || DEFAULT_SECTOR_TOKEN,
        pale: LLF_PALE[sector.code] || "var(--surface)",
        lead: { key: `s:${sector.id}`, label: sector.name, title: sector.name, sectorIds: [sector.id] },
        tabs: [],
      }));
    const pillars = projectType === "llf" ? llf : groupSectorOptions(sectors)
      .sort((a, b) => bySeq(a[0], b[0]))
      .map(([pillar, children]) => ({
        id: `p${pillar.id}`,
        pillar,
        color: PILLAR_TOKEN[pillar.code] || DEFAULT_SECTOR_TOKEN,
        pale: PILLAR_PALE[pillar.code] || "var(--surface)",
        lead: {
          key: `p:${pillar.id}`,
          label: PILLAR_SHORT[pillar.code] || pillar.name,
          title: `All ${pillar.name}`,
          sectorIds: [pillar.id, ...children.map((c) => c.id)],
        },
        tabs: [...children].sort(bySeq).map((c) => ({
          key: `s:${c.id}`, label: c.name, title: c.name, sectorIds: [c.id],
        })),
      }));
    return [
      { id: "all", color: "var(--muted)", pale: "var(--paper)", lead: ALL_TAB, tabs: [] },
      ...pillars,
      { id: "cct", color: "var(--sec-women)", pale: "var(--sec-women-pale)", lead: CCT_TABS[0], tabs: CCT_TABS.slice(1) },
    ];
  }, [sectors, projectType]);
  const pillarGroups = useMemo(() => tabGroups.filter((g) => g.pillar), [tabGroups]);

  const sectorColor = useMemo(() => {
    const map = {};
    for (const { color, lead } of pillarGroups) {
      for (const id of lead.sectorIds) map[id] = color;
    }
    return map;
  }, [pillarGroups]);

  const countFor = (t) => {
    if (t.all) return all.length;
    if (t.tags) return all.filter((i) => t.tags.some((tag) => (i.cross_cutting_tags || []).includes(tag))).length;
    return all.filter((i) => t.sectorIds.includes(i[sectorField])).length;
  };

  // Le catalogue s'ouvre sur "All" : c'est aussi la façon de lever le filtre.
  const activeKey = tab || ALL_TAB.key;
  const activeGroup = useMemo(
    () => tabGroups.find((g) => g.lead.key === activeKey || g.tabs.some((t) => t.key === activeKey)) || tabGroups[0],
    [activeKey, tabGroups],
  );
  const activeTab = useMemo(
    () => (activeGroup?.lead.key === activeKey
      ? activeGroup.lead
      : activeGroup?.tabs.find((t) => t.key === activeKey)) || ALL_TAB,
    [activeGroup, activeKey],
  );

  // --- Contenu de l'onglet ------------------------------------------------
  const tabItems = useMemo(() => {
    if (!activeTab) return [];
    if (activeTab.all) return all;
    if (activeTab.tags) {
      return all.filter((i) => activeTab.tags.some((t) => (i.cross_cutting_tags || []).includes(t)));
    }
    return all.filter((i) => activeTab.sectorIds.includes(i[sectorField]));
  }, [all, activeTab, sectorField]);

  const uniq = (list) => [...new Set(list.filter(Boolean))];
  const typeValues  = useMemo(() => uniq(tabItems.map((i) => i.indicator_type))
    .sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)), [tabItems]);
  const levelValues = useMemo(() => uniq(tabItems.map((i) => i.chain_level)).sort(), [tabItems]);
  // Sous-secteurs : trop nombreux pour des chips (18 pour la Santé), d'où un
  // MultiSelect, groupé par secteur — de la classification affichée (ADR
  // 0014) — quand l'onglet en couvre plusieurs.
  const subOptions  = useMemo(() => {
    const nameOf = (i) => i[`${sectorField}_name`] || "";
    const sectorsOf = new Map();
    for (const i of tabItems) {
      if (!i.subsector) continue;
      if (!sectorsOf.has(i.subsector)) sectorsOf.set(i.subsector, new Set());
      sectorsOf.get(i.subsector).add(nameOf(i));
    }
    const grouped = uniq(tabItems.map(nameOf)).length > 1;
    return [...sectorsOf.entries()]
      .map(([sub, sectors]) => ({
        value: sub,
        label: sub,
        group: grouped ? [...sectors].sort().join(" · ") : undefined,
      }))
      .sort((a, b) => (a.group || "").localeCompare(b.group || "") || a.label.localeCompare(b.label));
  }, [tabItems, sectorField]);

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

  const withSdg  = items.filter((i) => i.related_sdg_numbers?.length > 0).length;
  const noLevel  = items.filter((i) => !i.chain_level).length;

  function selectTab(key) {
    setTab(key);
    setTypeChips([]); setLevelChips([]); setSubChips([]);
    setOpenIds(new Set());
  }
  function toggleRow(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const toggle = (setter) => (v) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  return (
    <div className="view cat-view">
      <div className="cat-head">
        <div>
          <div className="view-eyebrow">Module 2 · {projectType === "llf" ? "LLF" : "IsDB"} classification</div>
          <h1 className="view-title">Indicator Catalogue</h1>
          <p className="view-lead">
            Same definition, method and disaggregation for every project ·{" "}
            {isLoading ? "loading…" : `${all.length} indicators`} · maintained by LLFMU
          </p>
        </div>
        <div className="cat-search">
          <Icon name="search" size={15} />
          <input placeholder="Code (A001.1) or keyword..."
            aria-label="Search the catalogue"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="exec-filterbar" style={{ marginBottom: 12 }}>
        <ProjectTypeFilter value={projectType} onChange={setProjectType} label="Classification" />
      </div>

      {/* Premiere rangee : une carte par pilier (IsDB) ou par secteur (LLF),
          plus "tout" et le transversal */}
      <div className="cat-cards">
        {tabGroups.map((g) => {
          const n = countFor(g.lead);
          const on = activeGroup?.id === g.id;
          const code = g.pillar ? g.pillar.code : g.id;
          return (
            <button key={g.id} title={g.lead.title || g.lead.label}
              style={{ "--tab-color": g.color, "--tab-pale": g.pale }}
              className={`cat-card${on ? " active" : ""}${g.id === "cct" ? " dashed" : ""}${n === 0 ? " off" : ""}`}
              onClick={() => selectTab(g.lead.key)}>
              <SectorIcon name={GROUP_ICON[code] || g.pillar?.icon || "generic"} color={g.color} size={34} />
              <span className="cat-card-name">{g.lead.label}</span>
              {g.id === "cct"
                ? <span className="cat-card-sub">applies across all {projectType === "llf" ? "sectors" : "pillars"}</span>
                : <span className="cat-card-value">{n}</span>}
              {on && <span className="cat-card-dot" />}
            </button>
          );
        })}
      </div>

      {/* Seconde rangee : les entrees du groupe actif */}
      {activeGroup?.tabs.length > 0 && (
        <div className="cat-tabrow" style={{ "--tab-color": activeGroup.color }}>
          <button
            className={`tab${activeKey === activeGroup.lead.key ? " active" : ""}`}
            title={activeGroup.lead.title}
            onClick={() => selectTab(activeGroup.lead.key)}>
            {activeGroup.id === "cct" ? "All themes" : "All sectors"} · {countFor(activeGroup.lead)}
          </button>
          {activeGroup.tabs.map((t) => {
            const n = countFor(t);
            return (
              <button key={t.key} title={t.title || t.label}
                className={`tab${activeKey === t.key ? " active" : ""}${n === 0 ? " tab-off" : ""}`}
                onClick={() => selectTab(t.key)}>
                {t.label} · {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Chiffres de la selection courante, sur une ligne */}
      <div className="cat-stats">
        <span><b>{items.length}</b> indicator{items.length !== 1 ? "s" : ""}</span>
        <span><b>{uniq(items.map((i) => i.subsector)).length}</b> sub-sector{uniq(items.map((i) => i.subsector)).length !== 1 ? "s" : ""}</span>
        <span><b>{withSdg}</b> with SDG</span>
        <span><b>{noLevel}</b> without chain level</span>
      </div>

      {/* Chips */}
      <div className="filter-chips mb-3">
        <ChipGroup label="Type" values={typeValues} selected={typeChips}
          onToggle={toggle(setTypeChips)}
          labelFor={(v) => TYPE_LABELS[v] || v} />
        <ChipGroup label="Chain level" values={levelValues} selected={levelChips}
          onToggle={toggle(setLevelChips)}
          labelFor={(v) => CHAIN_LEVEL_LABELS[v] || v} />
        {subOptions.length >= 2 && (
          <>
            <label className="filter-chip-label" htmlFor="cat-subsectors">Sub-sector</label>
            <div className="filter-multiselect">
              <MultiSelect id="cat-subsectors" placeholder="All sub-sectors"
                options={subOptions} value={subChips} onChange={setSubChips} />
            </div>
          </>
        )}
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
          <div className="section-bar" style={{ background: RESULT_LEVEL_COLOR[sec.type] || "var(--ink)" }}>
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
              <div className="ind-list">
                {group.rows.map((ind) => (
                  <IndicatorRow key={ind.id} ind={ind} sdgName={sdgName} canEdit={canEdit}
                    color={sectorColor[ind[sectorField]] || DEFAULT_SECTOR_TOKEN}
                    expanded={openIds.has(ind.id)}
                    onToggle={() => toggleRow(ind.id)}
                    onEdit={setEditId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {editId && (
        <IndicatorDrawer indicatorId={editId} sdgs={sdgs || []} sdgName={sdgName} projectType={projectType}
          onClose={() => setEditId(null)} />
      )}
    </div>
  );
}

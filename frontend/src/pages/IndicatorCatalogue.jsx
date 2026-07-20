import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";

const DIRECTION_LABEL = {
  increase: "↑ A la hausse",
  decrease: "↓ A la baisse",
  neutral: "→ Neutre",
};
const TYPE_COLOR = {
  output: "badge",
  outcome: "badge badge-orange",
  impact: "badge badge-lime",
};

// Champs texte/textarea generiques dans la fiche IRS
const FIELD_ROWS = [
  { key: "definition", label: "Definition", textarea: true },
  { key: "numerator", label: "Numerateur", textarea: true },
  { key: "denominator", label: "Denominateur", textarea: true },
  { key: "formula", label: "Formule", textarea: true },
  { key: "calculation_method", label: "Methode de calcul", textarea: true },
  { key: "data_source", label: "Data Sources", textarea: true },
  { key: "collection_method", label: "Methode de collecte", textarea: true },
  { key: "means_of_verification", label: "Means of Verification", textarea: true },
  { key: "assumptions", label: "Assumptions", textarea: true },
  { key: "limitations", label: "Limites", textarea: true },
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
        <option value="">Selectionner...</option>
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
                    <Icon name="pencil" size={13} /> Modifier
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
                {detail.disaggregation && (
                  <div>
                    <div className="dl-term">Disaggregation</div>
                    <div className="dl-desc">{detail.disaggregation}</div>
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
                {detail.related_sdg_numbers?.length > 0 && (
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
                )}
              </div>
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
                    <option value="quarterly">Quarterly</option>
                    <option value="semi_annual">Semi-annual</option>
                    <option value="annual">Annual</option>
                    <option value="end_of_project">End of project</option>
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
                label="Disaggregation"
                choices={choices?.disaggregations || []}
                value={form.disaggregation || ""}
                onChange={(v) => setForm({ ...form, disaggregation: v })}
              />

              <ComboField
                label="Responsible"
                choices={choices?.responsibles || []}
                value={form.responsible || ""}
                onChange={(v) => setForm({ ...form, responsible: v })}
              />

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
                  <Icon name="x" size={13} /> Annuler
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
export default function IndicatorCatalogue() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

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

  // Seul le role LLFMU peut modifier les indicateurs du catalogue — pour
  // l'instant on derive du meme flag que les donnees de base (a affiner
  // quand la matrice RBAC sera completement arbitree).
  const canEdit = true;

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · LLF2</div>
        <h1 className="view-title">Indicator Catalogue</h1>
        <p className="view-lead">
          Bibliotheque institutionnelle LLF2 — Agriculture, Health, Infrastructure.
          Alimente par LLFMU uniquement.
        </p>
      </div>

      {/* Filtres */}
      <div className="card card-flush mb-3">
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: 8 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Search</label>
              <input className="field-input" placeholder="Code (A001.1) or keyword..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Sector</label>
              <select className="field-select" value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}>
                <option value="">All</option>
                {sectors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Type</label>
              <select className="field-select" value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All</option>
                <option value="output">Output</option>
                <option value="outcome">Outcome</option>
                <option value="impact">Impact</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, display: "flex", alignItems: "flex-end" }}>
              <span className="text-muted text-sm">
                {isLoading ? "Loading..." : `${indicators?.length ?? 0} indicateur${indicators?.length !== 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="card card-flush">
        <div style={{ padding: 0 }}>
          {isLoading && <div style={{ padding: 16 }}><span className="spinner" /> Loading...</div>}
          {!isLoading && indicators?.length === 0 && (
            <div className="text-muted text-sm" style={{ padding: 16 }}>No indicators found.</div>
          )}
          {indicators?.map((ind, i) => (
            <IndicatorRow
              key={ind.id}
              ind={ind}
              isLast={i === indicators.length - 1}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

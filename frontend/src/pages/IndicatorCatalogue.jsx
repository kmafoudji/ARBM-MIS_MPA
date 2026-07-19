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

const FIELD_ROWS = [
  { key: "definition", label: "Definition", textarea: true },
  { key: "unit", label: "Unite de mesure" },
  { key: "numerator", label: "Numerateur", textarea: true },
  { key: "denominator", label: "Denominateur", textarea: true },
  { key: "formula", label: "Formule", textarea: true },
  { key: "calculation_method", label: "Methode de calcul", textarea: true },
  { key: "disaggregation", label: "Desagregation", textarea: true },
  { key: "data_source", label: "Sources de donnees", textarea: true },
  { key: "collection_method", label: "Methode de collecte", textarea: true },
  { key: "means_of_verification", label: "Moyens de verification", textarea: true },
  { key: "responsible", label: "Responsable" },
  { key: "assumptions", label: "Hypotheses", textarea: true },
  { key: "limitations", label: "Limites", textarea: true },
];

// ---------------------------------------------------------------------------
// Ligne expandable : fiche IRS en lecture + formulaire d'edition inline
// ---------------------------------------------------------------------------
function IndicatorRow({ ind, isLast, canEdit }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  // Charger la fiche complete uniquement quand expandee
  const { data: detail, isLoading } = useQuery({
    queryKey: ["indicator", ind.id],
    queryFn: () => apiFetch(`/api/results/indicators/${ind.id}/`),
    enabled: expanded,
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
          {isLoading && <div className="text-muted text-sm"><span className="spinner" /> Chargement...</div>}

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
                {detail.reporting_frequency_display && (
                  <div>
                    <div className="dl-term">Frequence de reporting</div>
                    <div className="dl-desc">{detail.reporting_frequency_display}</div>
                  </div>
                )}
                {detail.related_sdg_numbers?.length > 0 && (
                  <div>
                    <div className="dl-term">ODD lies</div>
                    <div className="dl-desc row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {detail.related_sdg_numbers.map((n) => (
                        <span key={n} className="row" style={{ gap: 4, alignItems: "center" }}>
                          <img src={`/logos/sdg/${n}.png`} alt={`ODD ${n}`} style={{ width: 24, height: 24 }} />
                          <span className="text-sm">ODD {n}</span>
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
                    <option value="increase">A la hausse (+)</option>
                    <option value="decrease">A la baisse (-)</option>
                    <option value="neutral">Neutre</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Frequence de reporting</label>
                  <select className="field-select" value={form.reporting_frequency || ""}
                    onChange={(e) => setForm({ ...form, reporting_frequency: e.target.value })}>
                    <option value="">Non specifie</option>
                    <option value="quarterly">Trimestrielle</option>
                    <option value="semi_annual">Semestrielle</option>
                    <option value="annual">Annuelle</option>
                    <option value="end_of_project">Fin de projet</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Nom complet</label>
                <textarea className="field-textarea" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

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

              {updateMutation.isError && (
                <div className="field-error mb-3">{JSON.stringify(updateMutation.error.detail)}</div>
              )}
              <div className="row">
                <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                  type="submit" disabled={updateMutation.isPending}>
                  <Icon name="check" size={13} /> {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
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
        <h1 className="view-title">Catalogue d'indicateurs</h1>
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
              <label className="field-label">Rechercher</label>
              <input className="field-input" placeholder="Code (A001.1) ou mot-cle..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Secteur</label>
              <select className="field-select" value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}>
                <option value="">Tous</option>
                {sectors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Type</label>
              <select className="field-select" value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Tous</option>
                <option value="output">Output</option>
                <option value="outcome">Outcome</option>
                <option value="impact">Impact</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, display: "flex", alignItems: "flex-end" }}>
              <span className="text-muted text-sm">
                {isLoading ? "Chargement..." : `${indicators?.length ?? 0} indicateur${indicators?.length !== 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="card card-flush">
        <div style={{ padding: 0 }}>
          {isLoading && <div style={{ padding: 16 }}><span className="spinner" /> Chargement...</div>}
          {!isLoading && indicators?.length === 0 && (
            <div className="text-muted text-sm" style={{ padding: 16 }}>Aucun indicateur trouve.</div>
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

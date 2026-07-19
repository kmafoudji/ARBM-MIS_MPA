import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";

const DIRECTION_LABEL = { increase: "↑ A la hausse", decrease: "↓ A la baisse", neutral: "→ Neutre" };
const TYPE_COLOR = { output: "badge", outcome: "badge badge-orange", impact: "badge badge-lime" };

function IndicatorSheet({ id, onClose }) {
  const { data: ind, isLoading } = useQuery({
    queryKey: ["indicator", id],
    queryFn: () => apiFetch(`/api/results/indicators/${id}/`),
  });

  if (isLoading) return (
    <div className="card card-flush" style={{ marginTop: 16 }}>
      <div className="card-body"><span className="spinner" /> Chargement de la fiche...</div>
    </div>
  );
  if (!ind) return null;

  return (
    <div className="card card-flush" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="view-eyebrow text-mono">{ind.code}</div>
          <h2 className="card-title">{ind.name}</h2>
          <div className="row mt-1" style={{ gap: 8 }}>
            <span className={TYPE_COLOR[ind.indicator_type] || "badge"}>{ind.indicator_type_display}</span>
            <span className="text-muted text-sm">{ind.sector_name}</span>
            {ind.subsector && <span className="text-muted text-sm">· {ind.subsector}</span>}
            <span className="text-muted text-sm">{DIRECTION_LABEL[ind.direction]}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onClose}>
          <Icon name="x" size={14} /> Fermer
        </button>
      </div>
      <div className="card-body">
        <div className="dl">
          <div><div className="dl-term">Unite de mesure</div><div className="dl-desc">{ind.unit}</div></div>
          <div><div className="dl-term">Definition</div><div className="dl-desc">{ind.definition || "—"}</div></div>
          {ind.numerator && <div><div className="dl-term">Numerateur</div><div className="dl-desc">{ind.numerator}</div></div>}
          {ind.denominator && <div><div className="dl-term">Denominateur</div><div className="dl-desc">{ind.denominator}</div></div>}
          {ind.formula && <div><div className="dl-term">Formule</div><div className="dl-desc">{ind.formula}</div></div>}
          {ind.calculation_method && <div><div className="dl-term">Methode de calcul</div><div className="dl-desc">{ind.calculation_method}</div></div>}
          {ind.disaggregation && <div><div className="dl-term">Desagregation</div><div className="dl-desc">{ind.disaggregation}</div></div>}
          {ind.data_source && <div><div className="dl-term">Sources de donnees</div><div className="dl-desc">{ind.data_source}</div></div>}
          {ind.collection_method && <div><div className="dl-term">Methode de collecte</div><div className="dl-desc">{ind.collection_method}</div></div>}
          {ind.reporting_frequency_display && <div><div className="dl-term">Frequence de reporting</div><div className="dl-desc">{ind.reporting_frequency_display}</div></div>}
          {ind.means_of_verification && <div><div className="dl-term">Moyens de verification</div><div className="dl-desc">{ind.means_of_verification}</div></div>}
          {ind.responsible && <div><div className="dl-term">Responsable</div><div className="dl-desc">{ind.responsible}</div></div>}
          {ind.assumptions && <div><div className="dl-term">Hypotheses</div><div className="dl-desc">{ind.assumptions}</div></div>}
          {ind.limitations && <div><div className="dl-term">Limites</div><div className="dl-desc">{ind.limitations}</div></div>}
          {ind.related_sdg_numbers?.length > 0 && (
            <div>
              <div className="dl-term">ODD lies</div>
              <div className="dl-desc row" style={{ gap: 8, flexWrap: "wrap" }}>
                {ind.related_sdg_numbers.map((n) => (
                  <span key={n} className="row" style={{ gap: 4, alignItems: "center" }}>
                    <img src={`/logos/sdg/${n}.png`} alt={`ODD ${n}`} style={{ width: 24, height: 24 }} />
                    <span className="text-sm">ODD {n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IndicatorCatalogue() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);

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
                value={search} onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Secteur</label>
              <select className="field-select" value={sectorFilter}
                onChange={(e) => { setSectorFilter(e.target.value); setSelectedId(null); }}>
                <option value="">Tous</option>
                {sectors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Type</label>
              <select className="field-select" value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setSelectedId(null); }}>
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
        <div className="card-body" style={{ padding: 0 }}>
          {isLoading && <div style={{ padding: 16 }}><span className="spinner" /> Chargement...</div>}
          {!isLoading && indicators?.length === 0 && (
            <div className="text-muted text-sm" style={{ padding: 16 }}>Aucun indicateur trouve.</div>
          )}
          {indicators?.map((ind, i) => (
            <div
              key={ind.id}
              onClick={() => setSelectedId(selectedId === ind.id ? null : ind.id)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                borderBottom: i < indicators.length - 1 ? "1px solid var(--rule-soft)" : "none",
                background: selectedId === ind.id ? "var(--lime-pale)" : "transparent",
                display: "flex", gap: 12, alignItems: "center",
              }}
            >
              <span className="text-mono" style={{ fontSize: 11, color: "var(--muted)", width: 60, flexShrink: 0 }}>{ind.code}</span>
              <span className={TYPE_COLOR[ind.indicator_type] || "badge"} style={{ fontSize: 10, flexShrink: 0 }}>
                {ind.indicator_type_display}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{ind.name}</span>
              <span className="text-muted text-sm" style={{ flexShrink: 0 }}>{ind.unit}</span>
              <Icon name={selectedId === ind.id ? "chevron-up" : "chevron-down"} size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Fiche détail inline */}
      {selectedId && (
        <IndicatorSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

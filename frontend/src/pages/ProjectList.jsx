import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const STAGE_BADGE = {
  concept_note: "badge",
  pipeline_taskforce_review: "badge",
  pipeline_taskforce_approved: "badge badge-violet",
  preparation_identification: "badge badge-violet",
  trc_endorsed: "badge badge-orange",
  ic_approved: "badge badge-orange",
  bed_approved: "badge badge-orange",
  appraisal: "badge badge-blue",
  effective: "badge badge-lime",
  implementing: "badge badge-lime",
  mid_term_review: "badge badge-lime",
  substantially_complete: "badge badge-green",
  closed: "badge badge-green",
  suspended: "badge badge-rose",
  cancelled: "badge badge-rose",
};

function formatBudget(value) {
  if (!value) return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString("fr-FR");
}

export default function ProjectList({ onCreateClick, onProjectClick }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects/"),
  });

  return (
    <div className="view">
      <div className="row row-between mb-4" style={{ alignItems: "flex-end" }}>
        <div className="view-header" style={{ marginBottom: 0 }}>
          <div className="view-eyebrow">Projets &amp; suivi</div>
          <h1 className="view-title">Portefeuille</h1>
          <p className="view-lead">
            Projets enregistres dans le systeme, du Concept Note a la cloture.
            Selectionnez un projet pour consulter sa fiche et son cycle de vie.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onCreateClick}>
          + Nouveau projet
        </button>
      </div>

      {isLoading && (
        <div className="loading-wrap" style={{ minHeight: 200 }}>
          <span className="spinner" /> Chargement du portefeuille...
        </div>
      )}

      {isError && (
        <div className="card">
          <div className="field-error">
            Impossible de charger les projets. Verifiez votre session et reessayez.
          </div>
        </div>
      )}

      {data?.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-title">Aucun projet enregistre</div>
            <p className="text-sm mb-3">
              Commencez par enregistrer un Concept Note — seuls le nom, le pays et le secteur
              sont requis a ce stade.
            </p>
            <button className="btn btn-primary" onClick={onCreateClick}>
              Enregistrer un projet
            </button>
          </div>
        </div>
      )}

      {data?.length > 0 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Projets</h2>
              <div className="card-sub">{data.length} enregistrement{data.length > 1 ? "s" : ""}</div>
            </div>
          </div>
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Code</th>
                <th>Projet</th>
                <th>Pays</th>
                <th>Secteur</th>
                <th>Etape</th>
                <th style={{ textAlign: "right" }}>Budget USD</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} onClick={() => onProjectClick(p.id)}>
                  <td className="text-mono text-xs">{p.code || "—"}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>
                    {p.lead_country_name}
                    {p.country_names?.length > 1 && (
                      <span className="badge mt-1" style={{ marginLeft: 6 }}>
                        +{p.country_names.length - 1}
                      </span>
                    )}
                  </td>
                  <td>
                    {p.primary_sector_name}
                    {p.contributing_sector_count > 0 && (
                      <span className="text-muted text-xs"> +{p.contributing_sector_count}</span>
                    )}
                  </td>
                  <td>
                    <span className={STAGE_BADGE[p.lifecycle_stage] || "badge"}>
                      {p.lifecycle_stage_display}
                    </span>
                  </td>
                  <td className="text-mono text-xs" style={{ textAlign: "right" }}>
                    {formatBudget(p.budget_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

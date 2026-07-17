import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

function Kpi({ label, value, extra }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? "—"}</div>
      {extra && <div className="kpi-extra">{extra}</div>}
    </div>
  );
}

const STAGE_PHASE = {
  concept_note: "Pre-approbation",
  pipeline_taskforce_review: "Pre-approbation",
  pipeline_taskforce_approved: "Pre-approbation",
  preparation_identification: "Pre-approbation",
  trc_endorsed: "Gate d'approbation",
  ic_approved: "Gate d'approbation",
  bed_approved: "Gate d'approbation",
  appraisal: "Mise en oeuvre",
  effective: "Mise en oeuvre",
  implementing: "Mise en oeuvre",
  mid_term_review: "Mise en oeuvre",
  substantially_complete: "Cloture",
  closed: "Cloture",
  suspended: "Exception",
  cancelled: "Exception",
};

const PHASE_COLOR = {
  "Pre-approbation": "var(--subtle)",
  "Gate d'approbation": "var(--orange)",
  "Mise en oeuvre": "var(--lime)",
  Cloture: "var(--blue)",
  Exception: "var(--rose)",
};

export default function Overview({ user }) {
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => apiFetch("/api/projects/") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => apiFetch("/api/identity/users/") });
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch("/api/identity/roles/") });

  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget_amount || 0), 0);
  const budgetM = totalBudget ? (totalBudget / 1_000_000).toFixed(1) : "0.0";

  const coveredCountries = new Set();
  projects?.forEach((p) => p.country_names?.forEach((c) => coveredCountries.add(c)));

  const byPhase = {};
  projects?.forEach((p) => {
    const phase = STAGE_PHASE[p.lifecycle_stage] || "Autre";
    byPhase[phase] = (byPhase[phase] || 0) + 1;
  });
  const maxPhase = Math.max(1, ...Object.values(byPhase));

  const bySector = {};
  projects?.forEach((p) => {
    if (!p.primary_sector_name) return;
    bySector[p.primary_sector_name] = (bySector[p.primary_sector_name] || 0) + Number(p.budget_amount || 0);
  });
  const maxSector = Math.max(1, ...Object.values(bySector));

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Console · LLF2</div>
        <h1 className="view-title">
          Pilotage du portefeuille{user?.name ? ` — ${user.name}` : ""}
        </h1>
        <p className="view-lead">
          Vue consolidee de la configuration : donnees de reference chargees, projets enregistres
          et repartition du portefeuille. Tout est configure via les ecrans d'administration.
        </p>
      </div>

      <div className="kpi-strip mb-4">
        <Kpi
          label="Projets enregistres"
          value={projects?.length}
          extra={`${coveredCountries.size} pays couvert${coveredCountries.size > 1 ? "s" : ""}`}
        />
        <Kpi label="Engagement total" value={<>{budgetM} <span style={{ fontSize: 16, color: "var(--muted)" }}>M USD</span></>} extra="budget indicatif cumule" />
        <Kpi label="Pays references" value={countries?.length} extra="referentiel GADM Admin 0" />
        <Kpi
          label="Utilisateurs"
          value={users?.length}
          extra={`${roles?.length ?? 0} roles configures`}
        />
      </div>

      <div className="grid grid-2">
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Repartition par secteur</h2>
              <div className="card-sub">Engagement financier · USD</div>
            </div>
            <span className="badge badge-lime">{Object.keys(bySector).length} secteurs</span>
          </div>
          <div className="card-body">
            {Object.keys(bySector).length === 0 && (
              <p className="text-muted text-sm">Aucun projet avec budget renseigne.</p>
            )}
            {Object.entries(bySector).map(([sector, amount]) => (
              <div key={sector} className="row mb-2" style={{ gap: "var(--s-3)" }}>
                <span style={{ flex: "0 0 34%", fontSize: 13 }}>{sector}</span>
                <span style={{ flex: 1, height: 6, background: "var(--rule-soft)", borderRadius: 100 }}>
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${(amount / maxSector) * 100}%`,
                      background: "var(--lime)",
                      borderRadius: 100,
                    }}
                  />
                </span>
                <span className="text-mono text-xs" style={{ flex: "0 0 70px", textAlign: "right" }}>
                  {(amount / 1_000_000).toFixed(1)}M
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Cycle de vie</h2>
              <div className="card-sub">Projets par phase · SF-4</div>
            </div>
            <span className="badge">{projects?.length ?? 0} projets</span>
          </div>
          <div className="card-body">
            {Object.keys(byPhase).length === 0 && (
              <p className="text-muted text-sm">Aucun projet enregistre.</p>
            )}
            {Object.entries(byPhase).map(([phase, count]) => (
              <div key={phase} className="row mb-2" style={{ gap: "var(--s-3)" }}>
                <span className="row" style={{ flex: "0 0 42%", gap: 8, fontSize: 13 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: PHASE_COLOR[phase] || "var(--subtle)",
                      flexShrink: 0,
                    }}
                  />
                  {phase}
                </span>
                <span style={{ flex: 1, height: 6, background: "var(--rule-soft)", borderRadius: 100 }}>
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${(count / maxPhase) * 100}%`,
                      background: PHASE_COLOR[phase] || "var(--subtle)",
                      borderRadius: 100,
                    }}
                  />
                </span>
                <span className="text-mono text-xs" style={{ flex: "0 0 24px", textAlign: "right" }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

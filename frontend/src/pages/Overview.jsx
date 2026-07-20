import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  concept_note: "pre_approval",
  pipeline_taskforce_review: "pre_approval",
  pipeline_taskforce_approved: "pre_approval",
  preparation_identification: "pre_approval",
  trc_endorsed: "approval_gate",
  ic_approved: "approval_gate",
  bed_approved: "approval_gate",
  appraisal: "implementation",
  effective: "implementation",
  implementing: "implementation",
  mid_term_review: "implementation",
  substantially_complete: "closure",
  closed: "closure",
  suspended: "exception",
  cancelled: "exception",
};

const PHASE_COLOR = {
  pre_approval: "var(--subtle)",
  approval_gate: "var(--orange)",
  implementation: "var(--lime)",
  closure: "var(--blue, #3F6CC5)",
  exception: "var(--rose)",
};

export default function Overview({ user }) {
  const { t } = useTranslation();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => apiFetch("/api/projects/") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => apiFetch("/api/identity/users/") });
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch("/api/identity/roles/") });

  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget_amount || 0), 0);
  const budgetM = totalBudget ? (totalBudget / 1_000_000).toFixed(1) : "0.0";

  const coveredCountries = new Set();
  projects?.forEach((p) => p.country_names?.forEach((c) => coveredCountries.add(c)));

  const PHASE_LABELS = {
    pre_approval: "Pre-Approval",
    approval_gate: "Approval Gate",
    implementation: "Implementation",
    closure: "Closure",
    exception: "Exception",
  };

  const byPhase = {};
  projects?.forEach((p) => {
    const phase = STAGE_PHASE[p.lifecycle_stage] || "exception";
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
        <div className="view-eyebrow">{t("app.console")}</div>
        <h1 className="view-title">
          Portfolio Dashboard{user?.name ? ` — ${user.name}` : ""}
        </h1>
        <p className="view-lead">
          Consolidated configuration view: reference data loaded, projects registered
          and portfolio distribution. Everything is configured via the administration screens.
        </p>
      </div>

      <div className="kpi-strip mb-4">
        <Kpi
          label="Registered Projects"
          value={projects?.length}
          extra={`${coveredCountries.size} countr${coveredCountries.size > 1 ? "ies" : "y"} covered`}
        />
        <Kpi label="Total Commitment" value={<>{budgetM} <span style={{ fontSize: 16, color: "var(--muted)" }}>{t("overview.m_usd")}</span></>} extra="cumulative indicative budget" />
        <Kpi label="Reference Countries" value={countries?.length} extra="GADM Admin 0 reference" />
        <Kpi
          label="Users"
          value={users?.length}
          extra={`${roles?.length ?? 0} roles configured`}
        />
      </div>

      <div className="grid grid-2">
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t("overview.by_sector")}</h2>
              <div className="card-sub">{t("envelope.commitment")}</div>
            </div>
            <span className="badge badge-lime">{Object.keys(bySector).length} sectors</span>
          </div>
          <div className="card-body">
            {Object.keys(bySector).length === 0 && (
              <p className="text-muted text-sm">{t("overview.no_budget")}</p>
            )}
            {Object.entries(bySector).map(([sector, amount]) => (
              <div key={sector} className="row mb-2" style={{ gap: "var(--s-3)" }}>
                <span style={{ flex: "0 0 34%", fontSize: 13 }}>{sector}</span>
                <span style={{ flex: 1, height: 6, background: "var(--rule-soft)", borderRadius: 100 }}>
                  <span style={{ display: "block", height: "100%", width: `${(amount / maxSector) * 100}%`, background: "var(--lime)", borderRadius: 100 }} />
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
              <h2 className="card-title">Lifecycle</h2>
              <div className="card-sub">{t("overview.phases")}</div>
            </div>
            <span className="badge">{projects?.length ?? 0} projects</span>
          </div>
          <div className="card-body">
            {Object.keys(byPhase).length === 0 && (
              <p className="text-muted text-sm">{t("project.none_desc")}</p>
            )}
            {Object.entries(byPhase).map(([phase, count]) => (
              <div key={phase} className="row mb-2" style={{ gap: "var(--s-3)" }}>
                <span className="row" style={{ flex: "0 0 42%", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: PHASE_COLOR[phase] || "var(--subtle)", flexShrink: 0 }} />
                  {PHASE_LABELS[phase] || phase}
                </span>
                <span style={{ flex: 1, height: 6, background: "var(--rule-soft)", borderRadius: 100 }}>
                  <span style={{ display: "block", height: "100%", width: `${(count / maxPhase) * 100}%`, background: PHASE_COLOR[phase] || "var(--subtle)", borderRadius: 100 }} />
                </span>
                <span className="text-mono text-xs" style={{ flex: "0 0 24px", textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

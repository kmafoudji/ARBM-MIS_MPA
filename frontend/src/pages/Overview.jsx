import { useQuery } from "@tanstack/react-query";
import PortfolioMap from "../components/PortfolioMap.jsx";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import Icon from "../components/Icon";

/* ── helpers ────────────────────────────────────────────────────────────── */
function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " K";
  return n.toLocaleString();
}

// Keyed by lifecycle code (backend LIFECYCLE_STAGE_CHOICES).
const STAGE_PHASE = {
  LS001: "pre_approval",   LS002: "pre_approval",   // Concept Note, Pipeline Taskforce Review
  LS003: "pre_approval",   LS004: "pre_approval",   // Pipeline Taskforce Selection, Preparation/LLF
  LS005: "approval_gate",  LS006: "approval_gate",  // TRC clearance, IC endorsed
  LS007: "pre_approval",   LS008: "pre_approval",   // IsDB AWP, Preparations
  LS009: "implementation", LS010: "approval_gate",  // Appraisal, BED Approved
  LS011: "implementation", LS012: "implementation", // Signature, Effective
  LS013: "implementation", LS014: "implementation", // Implementing, Mid-Term Review
  LS015: "closure",        LS016: "closure",        // Substantially Complete, Closed
  LS017: "exception",      LS018: "exception",      // Suspended, Cancelled
};
const PHASE_META = {
  pre_approval:  { label: "Pre-Approval",  color: "var(--subtle)" },
  approval_gate: { label: "Approval Gate", color: "var(--orange)" },
  implementation:{ label: "Implementation",color: "var(--lime)" },
  closure:       { label: "Closure",       color: "var(--violet)" },
  exception:     { label: "Exception",     color: "var(--rose)" },
};
/* LLF multi-series chart order (design.md §4.5) */
const SECTOR_COLOR = ["var(--lime)", "var(--blue)", "var(--orange)", "var(--rose)", "var(--violet)", "var(--subtle)"];

/* ── KPI héro ───────────────────────────────────────────────────────────── */
function HeroKpi({ icon, label, value, sub, accent }) {
  return (
    <div className="hero-kpi">
      <div className="hero-kpi-icon" style={{ background: accent ? "var(--lime-soft)" : "var(--surface-2)" }}>
        <Icon name={icon} size={18} style={{ color: accent ? "var(--lime-darker)" : "var(--text-muted)" }} />
      </div>
      <div className="hero-kpi-value">{value ?? <span className="spinner" />}</div>
      <div className="hero-kpi-label">{label}</div>
      {sub && <div className="hero-kpi-sub">{sub}</div>}
    </div>
  );
}

/* ── Barre de progression ───────────────────────────────────────────────── */
function Bar({ pct, color }) {
  return (
    <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, background: color, borderRadius: 99, transition: "width .5s ease" }} />
    </div>
  );
}

/* ── Badge étape ────────────────────────────────────────────────────────── */
// Short labels for the dashboard pill (the mockup abbreviates the same way);
// the full stage name stays in the tooltip.
const STAGE_SHORT = {
  LS002: "Pipeline TF Review",
  LS003: "Pipeline TF Selection",
  LS007: "IsDB AWP",
  LS015: "Subst. Complete",
};

function StagePill({ stage, label: stageLabel }) {
  const phase = STAGE_PHASE[stage] || "exception";
  const { color, label } = PHASE_META[phase] || {};
  const name = stageLabel || stage || "—";
  return (
    <span title={name} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, padding: "2px 8px",
      borderRadius: 99, background: color + "22", color: color, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {STAGE_SHORT[stage] || name}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Overview({ user, onProjectClick }) {
  const { t } = useTranslation();

  const { data: projects  } = useQuery({ queryKey: ["projects"],   queryFn: () => apiFetch("/api/projects/") });
  const { data: users     } = useQuery({ queryKey: ["users"],      queryFn: () => apiFetch("/api/identity/users/") });
  const { data: countries } = useQuery({ queryKey: ["countries"],  queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: hubs      } = useQuery({ queryKey: ["hubs"],       queryFn: () => apiFetch("/api/reference/hubs/") });
  const { data: donors    } = useQuery({ queryKey: ["donors"],     queryFn: () => apiFetch("/api/reference/donors/") });
  const { data: indicators} = useQuery({ queryKey: ["indicators"], queryFn: () => apiFetch("/api/results/indicators/") });
  const { data: roles     } = useQuery({ queryKey: ["roles"],      queryFn: () => apiFetch("/api/identity/roles/") });
  const { data: assignments} = useQuery({ queryKey: ["role-assignments"], queryFn: () => apiFetch("/api/identity/role-assignments/") });

  /* ── Calculs portfolio ── */
  const totalBudget = projects?.reduce((s, p) => s + Number(p.budget_amount || 0), 0) ?? 0;

  const coveredCountries = new Set();
  projects?.forEach(p => p.country_names?.forEach(c => coveredCountries.add(c)));

  const activeSectors = new Set();
  projects?.forEach(p => { if (p.primary_sector_name) activeSectors.add(p.primary_sector_name); });

  const activeHubs = new Set();
  projects?.forEach(p => { if (p.hub_name) activeHubs.add(p.hub_name); });

  /* ── Par pilier, puis par secteur (ADR 0007) ── */
  const byPillar = {};
  projects?.forEach(p => {
    if (!p.primary_sector_name) return;
    const pillar = p.pillar_name || p.primary_sector_name;
    const pillarEntry = byPillar[pillar] || (byPillar[pillar] = { budget: 0, count: 0, sectors: {} });
    const sectorEntry = pillarEntry.sectors[p.primary_sector_name]
      || (pillarEntry.sectors[p.primary_sector_name] = { budget: 0, count: 0 });
    const budget = Number(p.budget_amount || 0);
    pillarEntry.budget += budget; pillarEntry.count += 1;
    sectorEntry.budget += budget; sectorEntry.count += 1;
  });
  const pillarEntries = Object.entries(byPillar)
    .sort((a, b) => b[1].budget - a[1].budget)
    .map(([pillar, v]) => [pillar, { ...v, sectors: Object.entries(v.sectors).sort((a, b) => b[1].budget - a[1].budget) }]);
  const sectorCount = pillarEntries.reduce((n, [, v]) => n + v.sectors.length, 0);
  const maxPillar = Math.max(1, ...pillarEntries.map(([, v]) => v.budget));

  /* ── Par phase ── */
  const byPhase = {};
  projects?.forEach(p => {
    const phase = STAGE_PHASE[p.lifecycle_stage] || "exception";
    byPhase[phase] = (byPhase[phase] || 0) + 1;
  });
  const maxPhase = Math.max(1, ...Object.values(byPhase));

  /* ── Projets récents ── */
  const recentProjects = [...(projects || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  /* ── Par pays ── */
  const byCountry = {};
  projects?.forEach(p => {
    p.country_names?.forEach(c => {
      if (!byCountry[c]) byCountry[c] = 0;
      byCountry[c]++;
    });
  });
  const countryEntries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8);

  /* ── Rôle de l'utilisateur actuel ── */
  const myAssignment = assignments?.find(a => a.user_email === user?.email && !a.revoked_at);
  const myRole = myAssignment?.role_label || "LLFMU aRBM Specialist";

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="view">

      {/* ── En-tête personnalisé ── */}
      <div className="dash-hero-header">
        <div>
          <div className="view-eyebrow">{t("app.console")} · LLF2 Portfolio</div>
          <h1 className="view-title" style={{ marginBottom: 4 }}>
            {greeting}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
          </h1>
          <p className="view-lead" style={{ marginBottom: 0 }}>
            <span className="badge badge-lime" style={{ marginRight: 8 }}>{myRole}</span>
            Lives &amp; Livelihoods Fund 2 · {projects?.length ?? "—"} projects across {coveredCountries.size} countries
          </p>
        </div>
        <div className="dash-date">
          <div className="dash-date-day">{now.toLocaleDateString("en-GB", { weekday: "long" })}</div>
          <div className="dash-date-full">{now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      {/* ── KPIs héro ── */}
      <div className="hero-kpi-strip">
        <HeroKpi icon="package"    label="Projects"         value={projects?.length}          sub={`${coveredCountries.size} countries`} accent />
        <HeroKpi icon="wallet"     label="Total Commitment" value={fmt(totalBudget) + " USD"}  sub="indicative budget" />
        <HeroKpi icon="map-pin"    label="Countries"        value={coveredCountries.size}       sub={`of ${countries?.length ?? "?"} in reference`} />
        <HeroKpi icon="globe"      label="Active Hubs"      value={activeHubs.size || hubs?.length} sub={`of 8 LLF2 hubs`} />
        <HeroKpi icon="bar-chart"  label="Indicators"       value={indicators?.length ?? "—"}  sub="in catalogue" />
        <HeroKpi icon="tag"        label="Donors"           value={donors?.length ?? "—"}       sub="fund contributors" />
      </div>

      {/* ── Ligne 1 : secteurs + cycle de vie ── */}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>

        {/* Secteurs */}
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="bar-chart" size={14} style={{ marginRight: 6 }} />Portfolio by Sector</h2>
              <div className="card-sub">Financial commitment · USD</div>
            </div>
            <span className="badge badge-lime">{pillarEntries.length} pillar{pillarEntries.length !== 1 ? "s" : ""} · {sectorCount} sector{sectorCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="card-body">
            {pillarEntries.length === 0 && <p className="text-muted text-sm">No budget data yet.</p>}
            {pillarEntries.map(([pillar, { budget, count, sectors }], i) => (
              <div key={pillar} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: SECTOR_COLOR[i % SECTOR_COLOR.length], flexShrink: 0 }} />
                    {pillar}
                  </span>
                  <span style={{ display: "flex", gap: 12, fontSize: 12 }}>
                    <span className="badge">{count} project{count !== 1 ? "s" : ""}</span>
                    <span className="text-mono" style={{ fontWeight: 600, color: "var(--lime-darker)" }}>{fmt(budget)} USD</span>
                  </span>
                </div>
                <Bar pct={(budget / maxPillar) * 100} color={SECTOR_COLOR[i % SECTOR_COLOR.length]} />
                {sectors.map(([sector, sv]) => (
                  <div key={sector} style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingLeft: 18, fontSize: 12 }}>
                    <span className="text-muted">{sector}</span>
                    <span style={{ display: "flex", gap: 12 }}>
                      <span className="text-muted">{sv.count} project{sv.count !== 1 ? "s" : ""}</span>
                      <span className="text-mono">{fmt(sv.budget)} USD</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Cycle de vie */}
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="git-branch" size={14} style={{ marginRight: 6 }} />Project Lifecycle</h2>
              <div className="card-sub">Distribution by phase · SF-4</div>
            </div>
            <span className="badge">{projects?.length ?? 0} projects</span>
          </div>
          <div className="card-body">
            {Object.keys(byPhase).length === 0 && <p className="text-muted text-sm">No projects yet.</p>}
            {Object.entries(PHASE_META).map(([phase, { label, color }]) => {
              const count = byPhase[phase] || 0;
              if (!count && Object.keys(byPhase).length > 0) return null;
              return (
                <div key={phase} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      {label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 24, textAlign: "right" }}>{count}</span>
                  </div>
                  <Bar pct={(count / maxPhase) * 100} color={color} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Ligne 2 : projets récents + couverture géo ── */}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>

        {/* Projets récents */}
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="package" size={14} style={{ marginRight: 6 }} />Recent Projects</h2>
              <div className="card-sub">Last registered · up to 5</div>
            </div>
          </div>
          {recentProjects.length === 0
            ? <div className="empty"><div className="empty-title">No projects yet</div></div>
            : <div className="table-wrap"><table className="table" style={{ tableLayout: "fixed", minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th style={{ width: 220, textAlign: "right" }}>Stage · Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProjects.map(p => {
                    const meta = [p.country_names?.slice(0, 2).join(", "), p.primary_sector_name].filter(Boolean).join(" · ");
                    return (
                      <tr key={p.id}>
                        <td style={{ minWidth: 0 }}>
                          <div title={p.name} style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div className="text-xs text-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                            <StagePill stage={p.lifecycle_stage} label={p.lifecycle_stage_display} />
                            <span className="text-mono text-xs" style={{ minWidth: 56, textAlign: "right" }}>
                              {p.budget_amount ? fmt(Number(p.budget_amount)) : "—"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
          }
        </div>

        {/* Couverture géographique — flex column so the map fills the card
            and the row's two cards end up the same height. */}
        <div className="card card-flush" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="map-pin" size={14} style={{ marginRight: 6 }} />Geographic Coverage</h2>
              <div className="card-sub">Countries with active projects</div>
            </div>
            <span className="badge badge-lime">{coveredCountries.size} countries</span>
          </div>
          <div className="card-body" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            {projects?.length > 0
              ? <PortfolioMap projects={projects} onProjectClick={onProjectClick} compact />
              : <p className="text-muted text-sm" style={{ flex: 1 }}>No country data yet.</p>}
            {countryEntries.length > 0 && (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 2 }}>
                {countryEntries.map(([country, count]) => (
                  <span key={country} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                    background: "var(--surface-2)", borderRadius: 99,
                    padding: "3px 10px", fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 500 }}>{country}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-soft)" }}>{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ligne 3 : état du système ── */}
      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="check" size={14} style={{ marginRight: 6 }} />System Readiness</h2>
            <div className="card-sub">Configuration status — aRBM-MIS POC</div>
          </div>
          <span className="badge badge-lime">● Live</span>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[
              { icon: "globe",      label: "Countries",   value: countries?.length,   target: 30,  unit: "loaded" },
              { icon: "map-pin",    label: "Hubs",        value: hubs?.length,         target: 8,   unit: "of 8" },
              { icon: "tag",        label: "Donors",      value: donors?.length,       target: 6,   unit: "LLF2 donors" },
              { icon: "bar-chart",  label: "Indicators",  value: indicators?.length,   target: null, unit: "in catalogue" },
              { icon: "users",      label: "Users",       value: users?.length,         target: null, unit: "provisioned" },
              { icon: "git-branch", label: "Roles",       value: roles?.length,         target: 11,  unit: "of 11" },
            ].map(({ icon, label, value, target, unit }) => {
              const ok = value !== undefined && value !== null && (!target || value >= target);
              return (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10,
                  background: ok ? "color-mix(in srgb, var(--lime) 8%, transparent)" : "var(--surface-2)",
                  border: `1px solid ${ok ? "color-mix(in srgb, var(--lime) 20%, transparent)" : "var(--border)"}`,
                }}>
                  <Icon name={icon} size={16} style={{ color: ok ? "var(--lime-darker)" : "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: ok ? "var(--lime-darker)" : "var(--ink)", lineHeight: 1.2 }}>
                      {value ?? <span className="spinner" />}
                      {target && value ? <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}>/ {target}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{unit}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

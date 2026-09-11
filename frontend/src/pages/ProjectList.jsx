/**
 * ProjectList — Vue portefeuille projets
 * KPI bar · Filtres · Liste & Cards · Refresh auto
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Flag from "../components/Flag.jsx";
import SectorIcon from "../components/SectorIcon.jsx";
import Icon from "../components/Icon.jsx";
import RefreshBar, { SkeletonCard, SkeletonRow } from "../components/RefreshBar.jsx";
import PortfolioMap from "../components/PortfolioMap.jsx";

/* ── Constantes ──────────────────────────────────────────────────────────── */
/* Lifecycle codes (backend LIFECYCLE_STAGE_CHOICES): LS001 Concept Note …
   LS016 Closed in order, LS017 Suspended and LS018 Cancelled as exceptions. */
const STAGE_GROUPS = {
  pipeline:      { label: "Pipeline",      color: "var(--violet)", bg: "var(--violet-soft)", keys: ["LS001","LS002","LS003","LS004"] },
  appraisal:     { label: "Appraisal",     color: "var(--orange)", bg: "var(--sec-infra-pale)", keys: ["LS005","LS006","LS007","LS008","LS009","LS010","LS011"] },
  implementation:{ label: "Active",        color: "var(--lime)", bg: "var(--lime-pale)", keys: ["LS012","LS013","LS014"] },
  closing:       { label: "Closing",       color: "var(--lime)", bg: "var(--lime-pale)", keys: ["LS015","LS016"] },
  suspended:     { label: "Suspended",     color: "var(--rose)", bg: "var(--rose-soft)", keys: ["LS017","LS018"] },
};

const STAGE_BADGE = {
  LS001: "badge", LS002: "badge",
  LS003: "badge badge-violet", LS004: "badge badge-violet",
  LS005: "badge badge-blue", LS006: "badge badge-blue",
  LS007: "badge badge-blue", LS008: "badge badge-blue", LS009: "badge badge-blue",
  LS010: "badge badge-blue", LS011: "badge badge-blue",
  LS012: "badge badge-lime", LS013: "badge badge-lime", LS014: "badge badge-lime",
  LS015: "badge badge-green", LS016: "badge badge-green",
  LS017: "badge badge-rose", LS018: "badge badge-rose",
};

function formatBudget(value) {
  if (!value) return "—";
  const n = Number(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function stageGroup(stage) {
  for (const [k, g] of Object.entries(STAGE_GROUPS)) {
    if (g.keys.includes(stage)) return { key: k, ...g };
  }
  return { key: "pipeline", label: "Unknown", color: "var(--subtle)", bg: "var(--surface-2)" };
}

/* ── Sous-composants ─────────────────────────────────────────────────────── */

function KpiBar({ projects }) {
  const total     = projects.length;
  const budget    = projects.reduce((s, p) => s + Number(p.envelope_total || p.budget_amount || 0), 0);
  const countries = new Set(projects.map(p => p.lead_country_iso2).filter(Boolean)).size;
  const active    = projects.filter(p => STAGE_GROUPS.implementation.keys.includes(p.lifecycle_stage)).length;

  const groupCounts = {};
  Object.keys(STAGE_GROUPS).forEach(k => { groupCounts[k] = 0; });
  projects.forEach(p => { const g = stageGroup(p.lifecycle_stage); groupCounts[g.key] = (groupCounts[g.key] || 0) + 1; });

  return (
    <div style={{
      display: "flex", gap: 0, background: "var(--paper)",
      border: "1px solid var(--rule)", borderRadius: 12,
      overflow: "hidden", marginBottom: 20,
    }}>
      {[
        { value: total,                      label: "Total projects",     color: "var(--blue)", border: true },
        { value: active,                     label: "Active",             color: "var(--lime)", border: true },
        { value: formatBudget(budget),       label: "Portfolio budget",   color: "var(--ink-soft)", border: true },
        { value: countries,                  label: "Countries covered",  color: "var(--violet)", border: false },
      ].map(({ value, label, color, border }) => (
        <div key={label} style={{
          flex: 1, padding: "16px 20px", textAlign: "center",
          borderRight: border ? "1px solid var(--rule)" : "none",
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 4 }}>{label}</div>
        </div>
      ))}
      {/* Stade bar */}
      <div style={{ flex: 2, padding: "12px 20px", borderLeft: "1px solid var(--rule)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          By stage
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(STAGE_GROUPS).map(([k, g]) => groupCounts[k] > 0 && (
            <span key={k} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: g.bg, color: g.color }}>
              {groupCounts[k]} {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Linear order of the 16 nominal stages (mirrors LIFECYCLE_ORDER in the
   backend). Exception states (LS017 Suspended / LS018 Cancelled) are outside
   the order. */
const LIFECYCLE_ORDER = [
  "LS001", "LS002", "LS003", "LS004", "LS005", "LS006", "LS007", "LS008",
  "LS009", "LS010", "LS011", "LS012", "LS013", "LS014", "LS015", "LS016",
];
const SIGNATURE_INDEX = LIFECYCLE_ORDER.indexOf("LS012");   // Effective: separator before implementation
const DAYS_WARN = 30, DAYS_STALLED = 90;

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function daysColor(days, terminal) {
  if (days == null || terminal) return "var(--ink)";
  if (days >= DAYS_STALLED) return "var(--rose)";
  if (days >= DAYS_WARN) return "var(--orange)";
  return "var(--ink)";
}

function stageSummary(project) {
  const idx = LIFECYCLE_ORDER.indexOf(project.lifecycle_stage);
  if (idx < 0) return { idx, text: project.lifecycle_stage_display };
  const num = idx + 1;
  const name = project.lifecycle_stage_display;
  // Approval gates are not shown (ADR 0012): the detail is the phase only.
  let detail;
  if (project.lifecycle_stage === "LS016") detail = "closed";
  else if (idx >= SIGNATURE_INDEX) detail = "under implementation";
  else detail = "in origination";
  return { idx, text: `${num} · ${name} — ${detail}` };
}

function StageBar({ idx, exception }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, opacity: exception ? 0.35 : 1 }}>
      {LIFECYCLE_ORDER.map((s, i) => {
        const done = i <= idx;
        const color = !done ? "var(--rule)" : "var(--blue)";
        return (
          <span key={s} style={{ display: "contents" }}>
            {i === SIGNATURE_INDEX && <span style={{ width: 1, height: 14, background: "var(--rule)", margin: "0 3px" }} />}
            <span title={s} style={{ flex: 1, height: 7, borderRadius: 99, background: color, minWidth: 14 }} />
          </span>
        );
      })}
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  const sg = stageGroup(project.lifecycle_stage);
  const exception = sg.key === "suspended";
  const { idx, text } = stageSummary(project);
  const terminal = ["LS016", "LS018"].includes(project.lifecycle_stage);   // Closed, Cancelled
  const days = daysSince(project.stage_entered_on);
  const stalled = !terminal && !exception && days != null && days >= DAYS_STALLED;
  const budget = formatBudget(project.envelope_total || project.budget_amount);
  const meta = [
    project.primary_sector_name,
    budget !== "—" ? `US$ ${budget}` : null,
    project.country_names?.length > 1 ? `+${project.country_names.length - 1} countries` : null,
  ].filter(Boolean);

  return (
    <div className="card-click" onClick={() => onClick(project.id)}
      style={{
        background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 12,
        padding: "14px 20px",
        borderLeft: `4px solid ${sg.color}`,
        display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 1.1fr) 90px 130px",
        gap: 24, alignItems: "center",
      }}
    >
      {/* Identity */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 11, color: sg.color, fontWeight: 700, letterSpacing: .5 }}>
          <span>{project.official_reference_number}</span>
          <span style={{ color: "var(--rule)" }}>·</span>
          <Flag iso2={project.lead_country_iso2} size={12} />
          <span style={{ textTransform: "uppercase" }}>{project.lead_country_name}</span>
          {project.hub_name && <><span style={{ color: "var(--rule)" }}>·</span><span style={{ textTransform: "uppercase" }}>{project.hub_name}</span></>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", margin: "3px 0 4px", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
             title={project.name}>
          {project.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          <SectorIcon name={project.primary_sector_icon} color={project.primary_sector_color} size={14} />
          <span>{meta.join(" · ")}</span>
        </div>
      </div>

      {/* Stage progress */}
      <div style={{ minWidth: 0 }}>
        <StageBar idx={idx} exception={exception} />
        <div style={{ fontSize: 12, fontWeight: 600, color: exception ? sg.color : "var(--ink-soft)", marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {text}
        </div>
      </div>

      {/* Days in stage */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: daysColor(days, terminal || exception), lineHeight: 1.1 }}>
          {days ?? "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>days in stage</div>
      </div>

      {/* Action */}
      <div style={{ textAlign: "right" }}>
        {stalled ? (
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 99, background: "var(--rose-soft)", color: "var(--rose)" }}>
            ⚑ Stalled
          </span>
        ) : (
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 99, background: sg.bg, color: sg.color }}>
            {project.lifecycle_stage_display}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function ProjectList({ onCreateClick, onProjectClick }) {
  const [viewMode,    setViewMode]    = useState("cards");
  const [search,      setSearch]      = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sectorFilter,setSectorFilter]= useState("");
  const [hubFilter,   setHubFilter]   = useState("");

  const { data = [], isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["projects"],
    queryFn:  () => apiFetch("/api/projects/"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // Options dynamiques
  // Pillar → sectors, from the projects themselves (ADR 0007). A filter value
  // is "pillar:<name>" or "sector:<name>".
  const sectorGroups = useMemo(() => {
    const groups = new Map();
    data.forEach(p => {
      if (!p.primary_sector_name) return;
      const pillar = p.pillar_name || p.primary_sector_name;
      if (!groups.has(pillar)) groups.set(pillar, new Set());
      if (p.pillar_name && p.pillar_name !== p.primary_sector_name) groups.get(pillar).add(p.primary_sector_name);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([pillar, set]) => [pillar, [...set].sort()]);
  }, [data]);
  const hubs    = useMemo(() => [...new Set(data.map(p => p.hub_name).filter(Boolean))].sort(), [data]);

  // Filtrage
  const filtered = useMemo(() => data.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !(p.official_reference_number||"").toLowerCase().includes(q)) return false;
    if (stageFilter) {
      const sg = stageGroup(p.lifecycle_stage);
      if (sg.key !== stageFilter) return false;
    }
    if (sectorFilter) {
      const [kind, name] = [sectorFilter.slice(0, sectorFilter.indexOf(":")), sectorFilter.slice(sectorFilter.indexOf(":") + 1)];
      const value = kind === "pillar" ? (p.pillar_name || p.primary_sector_name) : p.primary_sector_name;
      if (value !== name) return false;
    }
    if (hubFilter    && p.hub_name !== hubFilter)               return false;
    return true;
  }), [data, search, stageFilter, sectorFilter, hubFilter]);

  const hasFilter = search || stageFilter || sectorFilter || hubFilter;

  function clearFilters() {
    setSearch(""); setStageFilter(""); setSectorFilter(""); setHubFilter("");
  }

  function selectStyle(active) {
    return {
      height: 32, padding: "0 10px", fontSize: 12, fontWeight: 500,
      border: active ? "1px solid var(--lime)" : "1px solid var(--rule)",
      borderRadius: 8, background: active ? "var(--lime-pale)" : "var(--surface)",
      color: active ? "var(--ink-soft)" : "var(--subtle)",
      fontFamily: "inherit", cursor: "pointer", outline: "none",
    };
  }

  return (
    <div className="view">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="row row-between mb-4" style={{ alignItems: "flex-start" }}>
        <div className="view-header" style={{ marginBottom: 0 }}>
          <div className="view-eyebrow">Projects &amp; monitoring</div>
          <h1 className="view-title">Portfolio</h1>
          <p className="view-lead">
            Projects registered in the system, from Concept Note to closure.
          </p>
          <div style={{ marginTop: 6 }}>
            <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
          </div>
        </div>
        <button className="btn btn-primary row" style={{ gap: 6, flexShrink: 0, marginTop: 4 }} onClick={onCreateClick}>
          <Icon name="plus" size={14} /> New Project
        </button>
      </div>

      {/* ── KPI bar ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ marginBottom: 20 }}><SkeletonCard height={72} /></div>
      ) : data.length > 0 && (
        <KpiBar projects={data} />
      )}

      {/* ── Filtres ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "10px 14px", background: "var(--paper)",
        border: "1px solid var(--rule)", borderRadius: 10, marginBottom: 20,
      }}>
        <Icon name="filter" size={13} style={{ color: "var(--subtle)", flexShrink: 0 }} />

        {/* Recherche */}
        <input type="text" placeholder="Search by name or reference…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12,
            border: search ? "1px solid var(--lime)" : "1px solid var(--rule)",
            borderRadius: 8, background: search ? "var(--lime-pale)" : "var(--surface)",
            fontFamily: "inherit", outline: "none", minWidth: 200,
          }}
        />

        {/* Stage */}
        <select style={selectStyle(stageFilter)} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGE_GROUPS).map(([k, g]) => (
            <option key={k} value={k}>{g.label}</option>
          ))}
        </select>

        {/* Sector */}
        {sectorGroups.length > 0 && (
          <select style={selectStyle(sectorFilter)} value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
            <option value="">All sectors</option>
            {sectorGroups.map(([pillar, sectors]) => (
              <optgroup key={pillar} label={pillar}>
                <option value={`pillar:${pillar}`}>All {pillar}</option>
                {sectors.map(s => <option key={s} value={`sector:${s}`}>{s}</option>)}
              </optgroup>
            ))}
          </select>
        )}

        {/* Hub */}
        {hubs.length > 0 && (
          <select style={selectStyle(hubFilter)} value={hubFilter} onChange={e => setHubFilter(e.target.value)}>
            <option value="">All hubs</option>
            {hubs.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        )}

        {hasFilter && (
          <button onClick={clearFilters} style={{
            height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600,
            border: "1px solid var(--rose-soft)", borderRadius: 8,
            background: "var(--sec-health-pale)", color: "var(--rose)",
            fontFamily: "inherit", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="x" size={12} /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--subtle)" }}>
            {filtered.length}{hasFilter ? ` of ${data.length}` : ""} project{filtered.length !== 1 ? "s" : ""}
          </span>
          {/* Toggle view mode */}
          <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
            {[
              { mode: "cards", icon: "grid" },
              { mode: "map", icon: "map-pin" },
              { mode: "list", icon: "align-center" },
            ].map(({ mode, icon }) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{
                  width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  background: viewMode === mode ? "var(--lime)" : "var(--paper)",
                  color: viewMode === mode ? "var(--paper)" : "var(--subtle)",
                  border: "none", cursor: "pointer",
                }}>
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Erreur ──────────────────────────────────────────────────── */}
      {!isLoading && data.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-title">No projects registered</div>
            <p className="text-sm mb-3">Start by registering a Concept Note.</p>
            <button className="btn btn-primary" onClick={onCreateClick}>Register a project</button>
          </div>
        </div>
      )}

      {/* ── Skeleton ────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="card card-flush">
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)" }}>
            <SkeletonCard height={16} />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}</tbody>
          </table>
        </div>
      )}

      {/* ── Liste ───────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && viewMode === "list" && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Projects</h2>
              <div className="card-sub">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Project</th>
                <th>Countries</th>
                <th>Hub</th>
                <th>Sector</th>
                <th>Stage</th>
                <th style={{ textAlign: "right" }}>Budget USD</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => onProjectClick(p.id)}>
                  <td className="text-mono text-xs">{p.official_reference_number || "—"}</td>
                  <td style={{ fontWeight: 500 }}>
                    {p.name}
                    
                  </td>
                  <td>
                    <span className="row" style={{ gap: 7 }}>
                      <Flag iso2={p.lead_country_iso2} size={16} title={p.lead_country_name} />
                      {p.lead_country_name}
                      {p.country_names?.length > 1 && (
                        <span className="badge">+{p.country_names.length - 1}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.hub_name || "—"}</td>
                  <td>
                    <span className="row" style={{ gap: 7 }}>
                      <SectorIcon name={p.primary_sector_icon} color={p.primary_sector_color} size={22} />
                      <span>
                        {p.primary_sector_name}
                        {p.pillar_name && p.pillar_name !== p.primary_sector_name && (
                          <div className="text-muted text-xs">{p.pillar_name}</div>
                        )}
                      </span>
                      {p.contributing_sector_count > 0 && (
                        <span className="text-muted text-xs">+{p.contributing_sector_count}</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={STAGE_BADGE[p.lifecycle_stage] || "badge"}>
                      {p.lifecycle_stage_display}
                    </span>
                  </td>
                  <td className="text-mono text-xs" style={{ textAlign: "right" }}>
                    {formatBudget(p.envelope_total || p.budget_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cards ───────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && viewMode === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {filtered.map(p => (
            <ProjectCard key={p.id} project={p} onClick={onProjectClick} />
          ))}
        </div>
      )}

      {/* ── Carte ───────────────────────────────────────────────────── */}
      {!isLoading && viewMode === "map" && (
        <PortfolioMap projects={filtered} onProjectClick={onProjectClick} />
      )}

      {/* ── Aucun résultat après filtre ─────────────────────────────── */}
      {!isLoading && data.length > 0 && filtered.length === 0 && viewMode !== "map" && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--subtle)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 12 }}>
          <Icon name="filter" size={28} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>No projects match</div>
          <button onClick={clearFilters} style={{ fontSize: 12, color: "var(--lime)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

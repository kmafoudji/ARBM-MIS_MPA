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
const STAGE_GROUPS = {
  pipeline:      { label: "Pipeline",      color: "#6366f1", bg: "#ede9fe", keys: ["concept_note","pipeline_taskforce_review","pipeline_taskforce_approved","preparation_identification"] },
  appraisal:     { label: "Appraisal",     color: "#d97706", bg: "#fef9c3", keys: ["trc_endorsed","ic_approved","bed_approved","appraisal"] },
  implementation:{ label: "Active",        color: "#A4C53F", bg: "#f0f6dc", keys: ["effective","implementing","mid_term_review"] },
  closing:       { label: "Closing",       color: "#16a34a", bg: "#dcfce7", keys: ["substantially_complete","closed"] },
  suspended:     { label: "Suspended",     color: "#dc2626", bg: "#fee2e2", keys: ["suspended","cancelled"] },
};

const STAGE_BADGE = {
  concept_note: "badge", pipeline_taskforce_review: "badge",
  pipeline_taskforce_approved: "badge badge-violet", preparation_identification: "badge badge-violet",
  trc_endorsed: "badge badge-orange", ic_approved: "badge badge-orange", bed_approved: "badge badge-orange",
  appraisal: "badge badge-blue", effective: "badge badge-lime", implementing: "badge badge-lime",
  mid_term_review: "badge badge-lime", substantially_complete: "badge badge-green",
  closed: "badge badge-green", suspended: "badge badge-rose", cancelled: "badge badge-rose",
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
  return { key: "pipeline", label: "Unknown", color: "#9ca3af", bg: "#f3f4f6" };
}

/* ── Sous-composants ─────────────────────────────────────────────────────── */

function KpiBar({ projects }) {
  const total     = projects.length;
  const budget    = projects.reduce((s, p) => s + Number(p.envelope_total || p.budget_amount || 0), 0);
  const countries = new Set(projects.map(p => p.lead_country_iso2).filter(Boolean)).size;
  const active    = projects.filter(p => ["effective","implementing","mid_term_review"].includes(p.lifecycle_stage)).length;

  const groupCounts = {};
  Object.keys(STAGE_GROUPS).forEach(k => { groupCounts[k] = 0; });
  projects.forEach(p => { const g = stageGroup(p.lifecycle_stage); groupCounts[g.key] = (groupCounts[g.key] || 0) + 1; });

  return (
    <div style={{
      display: "flex", gap: 0, background: "#fff",
      border: "1px solid #e5e7eb", borderRadius: 12,
      overflow: "hidden", marginBottom: 20,
    }}>
      {[
        { value: total,                      label: "Total projects",     color: "#1B5A8C", border: true },
        { value: active,                     label: "Active",             color: "#A4C53F", border: true },
        { value: formatBudget(budget),       label: "Portfolio budget",   color: "#374151", border: true },
        { value: countries,                  label: "Countries covered",  color: "#6366f1", border: false },
      ].map(({ value, label, color, border }) => (
        <div key={label} style={{
          flex: 1, padding: "16px 20px", textAlign: "center",
          borderRight: border ? "1px solid #f0f0ee" : "none",
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{label}</div>
        </div>
      ))}
      {/* Stade bar */}
      <div style={{ flex: 2, padding: "12px 20px", borderLeft: "1px solid #f0f0ee" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
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

function ProjectCard({ project, onClick }) {
  const sg = stageGroup(project.lifecycle_stage);
  return (
    <div onClick={() => onClick(project.id)}
      style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
        padding: 16, cursor: "pointer", transition: "all .15s",
        borderTop: `3px solid ${sg.color}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px #0001"; e.currentTarget.style.borderColor = sg.color; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.borderTopColor = sg.color; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>{project.official_reference_number}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: sg.bg, color: sg.color }}>
          {project.lifecycle_stage_display}
        </span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 8, lineHeight: 1.3 }}>
        {project.name.length > 70 ? project.name.slice(0, 70) + "…" : project.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "#6b7280" }}>
        <Flag iso2={project.lead_country_iso2} size={14} />
        <span>{project.lead_country_name}</span>
        {project.country_names?.length > 1 && (
          <span style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 6px", borderRadius: 99 }}>
            +{project.country_names.length - 1}
          </span>
        )}
        {project.hub_name && (
          <>
            <span style={{ color: "#d1d5db" }}>·</span>
            <span style={{ fontSize: 11 }}>{project.hub_name}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
          <SectorIcon name={project.primary_sector_icon} color={project.primary_sector_color} size={18} />
          <span>{project.primary_sector_name}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5A8C" }}>
          {formatBudget(project.envelope_total || project.budget_amount)}
          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400, marginLeft: 3 }}>USD</span>
        </div>
      </div>
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function ProjectList({ onCreateClick, onProjectClick }) {
  const [viewMode,    setViewMode]    = useState("list");
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
  const sectors = useMemo(() => [...new Map(data.map(p => [p.primary_sector_name, p.primary_sector_name])).values()].filter(Boolean).sort(), [data]);
  const hubs    = useMemo(() => [...new Set(data.map(p => p.hub_name).filter(Boolean))].sort(), [data]);

  // Filtrage
  const filtered = useMemo(() => data.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !(p.official_reference_number||"").toLowerCase().includes(q)) return false;
    if (stageFilter) {
      const sg = stageGroup(p.lifecycle_stage);
      if (sg.key !== stageFilter) return false;
    }
    if (sectorFilter && p.primary_sector_name !== sectorFilter) return false;
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
      border: active ? "1px solid #A4C53F" : "1px solid #e5e7eb",
      borderRadius: 8, background: active ? "#f0f6dc" : "#f9fafb",
      color: active ? "#374151" : "#9ca3af",
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
        padding: "10px 14px", background: "#fff",
        border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 20,
      }}>
        <Icon name="filter" size={13} style={{ color: "#9ca3af", flexShrink: 0 }} />

        {/* Recherche */}
        <input type="text" placeholder="Search by name or reference…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12,
            border: search ? "1px solid #A4C53F" : "1px solid #e5e7eb",
            borderRadius: 8, background: search ? "#f0f6dc" : "#f9fafb",
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
        {sectors.length > 0 && (
          <select style={selectStyle(sectorFilter)} value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
            <option value="">All sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
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
            border: "1px solid #fca5a5", borderRadius: 8,
            background: "#fef2f2", color: "#dc2626",
            fontFamily: "inherit", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="x" size={12} /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {filtered.length}{hasFilter ? ` of ${data.length}` : ""} project{filtered.length !== 1 ? "s" : ""}
          </span>
          {/* Toggle view mode */}
          <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {[
              { mode: "list", icon: "align-center" },
              { mode: "cards", icon: "grid" },
              { mode: "map", icon: "map-pin" },
            ].map(({ mode, icon }) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{
                  width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  background: viewMode === mode ? "#A4C53F" : "#fff",
                  color: viewMode === mode ? "#fff" : "#9ca3af",
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
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0ee" }}>
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
                  <td style={{ fontSize: 12, color: "#6b7280" }}>{p.hub_name || "—"}</td>
                  <td>
                    <span className="row" style={{ gap: 7 }}>
                      <SectorIcon name={p.primary_sector_icon} color={p.primary_sector_color} size={22} />
                      {p.primary_sector_name}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
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
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <Icon name="filter" size={28} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No projects match</div>
          <button onClick={clearFilters} style={{ fontSize: 12, color: "#A4C53F", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

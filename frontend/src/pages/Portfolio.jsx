/**
 * Portfolio Results — SF-4 Module 2
 * Cockpit de performance portefeuille LLF2 · IsDB
 */
import { useState } from "react";
import Select from "../components/Select.jsx";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import { fmtNum, fmtPct } from "../utils.js";
import RefreshBar, { SkeletonRow, SkeletonCard } from "../components/RefreshBar.jsx";

/* ── Constantes ──────────────────────────────────────────────────────────── */
const RAG = {
  green: { color: "var(--lime-darker)", bg: "var(--lime-pale)", border: "var(--lime-soft)", label: "On track",  icon: "circle-check" },
  amber: { color: "var(--orange-darker)", bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", label: "At risk",   icon: "alert-triangle" },
  red:   { color: "var(--rose-darker)", bg: "var(--sec-health-pale)", border: "var(--rose-soft)", label: "Off track", icon: "circle-x" },
  na:    { color: "var(--subtle)", bg: "var(--surface-2)", border: "var(--subtle)", label: "No data",   icon: "minus" },
};
const CHAIN_LEVELS = [
  { key: "activity",             label: "Activities",             icon: "zap" },
  { key: "output",               label: "Outputs",                icon: "package" },
  { key: "immediate_outcome",    label: "Immediate Outcomes",     icon: "trending-up" },
  { key: "intermediate_outcome", label: "Intermediate Outcomes",  icon: "layers" },
  { key: "ultimate_outcome",     label: "Ultimate Outcomes",      icon: "target" },
];

/* ── Sous-composants ─────────────────────────────────────────────────────── */

function KpiCard({ value, label, sub, color = "var(--ink)" }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: "var(--paper)",
      border: "1px solid var(--rule)",
      borderRadius: 14,
      padding: "18px 20px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color,
      }} />
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RagPill({ rag, rate }) {
  const cfg = RAG[rag] || RAG.na;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
    }}>
      <Icon name={cfg.icon} size={11} />
      {cfg.label}{rate != null ? ` · ${fmtPct(rate)}` : ""}
    </span>
  );
}

function ProgressBar({ actual, target, rag }) {
  if (!target || !actual) return <span style={{ color: "var(--rule)", fontSize: 11 }}>—</span>;
  const pct = Math.min(100, (parseFloat(actual) / parseFloat(target)) * 100);
  const color = RAG[rag]?.color || "var(--subtle)";
  return (
    <div style={{ width: "100%", maxWidth: 120 }}>
      <div style={{ height: 6, background: "var(--rule)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 2, textAlign: "right" }}>
        {fmtPct(pct)}
      </div>
    </div>
  );
}

function IndicatorRow({ ind, projectId, isLast }) {
  const [open, setOpen] = useState(false);
  const cfg = RAG[ind.rag_status] || RAG.na;

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: "pointer",
          borderBottom: open ? "none" : isLast ? "none" : "1px solid var(--rule)",
          transition: "background .1s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
        onMouseLeave={e => e.currentTarget.style.background = ""}
      >
        {/* Indicateur */}
        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: cfg.color, flexShrink: 0,
            }} />
            <div>
              <span style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                color: "var(--subtle)", marginRight: 6,
              }}>{ind.indicator_code}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {ind.indicator_name.length > 65 ? ind.indicator_name.slice(0, 65) + "…" : ind.indicator_name}
              </span>
            </div>
          </div>
        </td>
        {/* Valeur agrégée */}
        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 700, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap" }}>
          {ind.aggregated_value != null ? fmtNum(ind.aggregated_value) : <span style={{ color: "var(--rule)" }}>—</span>}
          <span style={{ fontSize: 10, color: "var(--subtle)", marginLeft: 4, fontWeight: 400 }}>{ind.indicator_unit}</span>
          {ind.target_value && (
            <div style={{ fontSize: 10, color: "var(--subtle)", fontWeight: 400, marginTop: 1 }}>
              / {fmtNum(ind.target_value)} target
            </div>
          )}
        </td>
        {/* Progression */}
        <td style={{ padding: "12px 12px", textAlign: "center" }}>
          <ProgressBar actual={ind.aggregated_value} target={ind.target_value} rag={ind.rag_status} />
        </td>
        {/* RAG */}
        <td style={{ padding: "12px 8px", textAlign: "center" }}>
          <RagPill rag={ind.rag_status} rate={ind.achievement_rate} />
        </td>
        {/* Projets */}
        <td style={{ padding: "12px 8px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          {ind.projects_count}
        </td>
        {/* Expand */}
        <td style={{ padding: "12px 12px", textAlign: "center" }}>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} style={{ color: "var(--subtle)" }} />
        </td>
      </tr>

      {/* Drill-down */}
      {open && ind.breakdown.length > 0 && (
        <tr>
          <td colSpan={6} style={{ padding: "0 16px 16px", borderBottom: isLast ? "none" : "1px solid var(--rule)" }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "8px 14px",
                background: "var(--rule)",
                fontSize: 11, fontWeight: 700, color: "var(--muted)",
                textTransform: "uppercase", letterSpacing: "0.07em",
                display: "flex", justifyContent: "space-between",
              }}>
                <span>Project breakdown</span>
                <span style={{ fontWeight: 400, color: "var(--subtle)" }}>
                  Rule: <strong style={{ color: "var(--ink-soft)" }}>{ind.aggregation_rule}</strong>
                </span>
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                    {["Project", "Hub", "Sector", "Actual", "Target", "RAG"].map(h => (
                      <th key={h} style={{
                        padding: "7px 12px", textAlign: h === "Actual" || h === "Target" ? "right" : "left",
                        fontSize: 10, fontWeight: 700, color: "var(--subtle)",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ind.breakdown.map((b, i) => (
                    <tr key={b.project_id} style={{ borderBottom: i < ind.breakdown.length - 1 ? "1px solid var(--rule)" : "none" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--subtle)", marginRight: 6 }}>
                          {b.project_code}
                        </span>
                        <span style={{ color: "var(--ink-soft)" }}>{b.project_name}</span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--muted)" }}>{b.hub || "—"}</td>
                      <td style={{ padding: "8px 12px", color: "var(--muted)" }}>{b.sector || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>
                        {fmtNum(b.actual_value)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--muted)" }}>
                        {b.target_value ? fmtNum(b.target_value) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <RagPill rag={b.rag_status} rate={b.achievement_rate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function LevelSection({ level, indicators }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!indicators.length) return null;

  const green = indicators.filter(i => i.rag_status === "green").length;
  const amber = indicators.filter(i => i.rag_status === "amber").length;
  const red   = indicators.filter(i => i.rag_status === "red").length;

  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--rule)",
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          background: "var(--surface)",
          borderBottom: collapsed ? "none" : "1px solid var(--rule)",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9,
            background: "color-mix(in srgb, var(--lime) 14%, transparent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--lime-darker)",
          }}>
            <Icon name={level.icon} size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{level.label}</div>
            <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>
              {indicators.length} indicator{indicators.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {[
            { count: green, color: "var(--lime)", label: "Green" },
            { count: amber, color: "var(--orange)", label: "Amber" },
            { count: red,   color: "var(--rose)", label: "Red" },
          ].map(({ count, color, label }) => count > 0 && (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600, color,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
              {count}
            </span>
          ))}
          <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={15} style={{ color: "var(--subtle)", marginLeft: 8 }} />
        </div>
      </div>

      {/* Table */}
      {!collapsed && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--rule)" }}>
              {[
                { label: "Indicator",        align: "left",   width: "auto" },
                { label: "Aggregated value", align: "right",  width: 160 },
                { label: "Progress",         align: "center", width: 140 },
                { label: "Status",           align: "center", width: 160 },
                { label: "Projects",         align: "center", width: 80  },
                { label: "",                 align: "center", width: 44  },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: "9px 8px",
                  textAlign: align,
                  fontSize: 10, fontWeight: 700, color: "var(--subtle)",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  width,
                  ...(label === "Indicator" ? { paddingLeft: 16 } : {}),
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind, i) => (
              <IndicatorRow
                key={ind.indicator_id}
                ind={ind}
                isLast={i === indicators.length - 1}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Pillars with their sectors nested; the filter flattens them into groups. */
function sectorFilterOptions(sectors) {
  const pillars = sectors.filter(s => s.parent === null || s.parent === undefined);
  return pillars.map(p => ({
    value: String(p.id),
    label: p.name,
    children: sectors.filter(s => s.parent === p.id).map(s => ({ value: String(s.id), label: s.name })),
  }));
}

// What each filter shows while it filters nothing.
const FILTER_PLACEHOLDERS = {
  country: "All countries", sector: "All sectors",
  donor: "All donors", chain_level: "All levels", rag: "All statuses",
};

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function Portfolio() {
  // No hub filter: the hub is the session scope chosen in the top bar,
  // which already narrows every portfolio figure.
  const [filters, setFilters] = useState({ sector: "", chain_level: "", country: "", donor: "", rag: "" });

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  const { data: sectors  = [] } = useQuery({ queryKey: ["sectors"],  queryFn: () => apiFetch("/api/reference/sectors/") });
  const { data: countries= [] } = useQuery({ queryKey: ["countries"],queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: donors   = [] } = useQuery({ queryKey: ["ref","donors"], queryFn: () => apiFetch("/api/reference/donors/") });

  const params = new URLSearchParams();
  if (filters.sector)      params.set("sector",      filters.sector);
  if (filters.chain_level) params.set("chain_level", filters.chain_level);
  if (filters.country)     params.set("country",     filters.country);
  if (filters.donor)       params.set("donor",       filters.donor);
  if (filters.rag)         params.set("rag",         filters.rag);

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["portfolio-aggregation", filters],
    queryFn:  () => apiFetch(`/api/results/portfolio/?${params}`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // Refresh auto toutes les 5 minutes
  });

  const meta       = data?.meta || {};
  const indicators = data?.indicators || [];

  // Grouper par niveau
  const filteredCountries = countries.filter(c => c.is_active);

  const byLevel = {};
  CHAIN_LEVELS.forEach(l => { byLevel[l.key] = []; });
  indicators.forEach(ind => {
    const k = ind.chain_level || "output";
    if (!byLevel[k]) byLevel[k] = [];
    byLevel[k].push(ind);
  });

  // Score santé global
  const withData  = meta.with_data || 0;
  const total     = meta.indicators_count || 0;
  const rag       = meta.rag_summary || {};
  const healthPct = total ? Math.round(((rag.green || 0) / Math.max(withData, 1)) * 100) : 0;

  return (
    <div className="view">

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="view-header">
        <div className="view-eyebrow">Results · SF-4 · Lives &amp; Livelihoods Fund</div>
        <h1 className="view-title">Portfolio Results</h1>
        <p className="view-lead">
          Aggregated performance across all active LLF2 projects · Approved data only
        </p>
        <div style={{ marginTop: 8 }}>
          <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard
          value={meta.projects_count ?? "—"}
          label="Active projects"
          sub="With workspace"
          color="var(--ink)"
        />
        <KpiCard
          value={meta.indicators_count ?? "—"}
          label="Indicators tracked"
          sub="In results framework"
          color="var(--blue)"
        />
        <KpiCard
          value={withData}
          label="With approved data"
          sub={`${total - withData} pending`}
          color="var(--lime)"
        />
        <KpiCard
          value={withData ? `${healthPct}%` : "—"}
          label="On track"
          sub={withData
            ? `${rag.green || 0} green · ${rag.amber || 0} amber · ${rag.red || 0} red`
            : "No approved data yet"}
          color={!withData ? "var(--subtle)" : healthPct >= 80 ? "var(--lime)" : healthPct >= 60 ? "var(--orange)" : "var(--rose)"}
        />
      </div>

      {/* ── Légende RAG ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
        padding: "10px 16px",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        marginBottom: 16,
        fontSize: 12,
      }}>
        <span style={{ fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          RAG Scale
        </span>
        {[
          { color: "var(--lime-darker)", bg: "var(--lime-pale)", label: "On track",  desc: "≥ 90% of target" },
          { color: "var(--orange-darker)", bg: "var(--sec-infra-pale)", label: "At risk",   desc: "60–89% of target" },
          { color: "var(--rose-darker)", bg: "var(--rose-soft)", label: "Off track", desc: "< 60% of target" },
          { color: "var(--subtle)", bg: "var(--surface-2)", label: "No data",   desc: "No approved data or target" },
        ].map(({ color, bg, label, desc }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
              background: bg, color,
            }}>{label}</span>
            <span style={{ color: "var(--subtle)", fontSize: 11 }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* ── Filtre strip ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        marginBottom: 24,
        padding: "12px 16px",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 10,
      }}>
        <Icon name="filter" size={14} style={{ color: "var(--subtle)", flexShrink: 0 }} />

        {[
          { key: "country",   label: "Country",   options: filteredCountries.map(c => ({ value: String(c.id), label: c.name })) },
          // ADR 0007: the backend expands a pillar to its sectors, so the
          // pillar is itself an option ("All <pillar>") above its sectors.
          { key: "sector",    label: "Sector",    options: sectorFilterOptions(sectors) },
          { key: "donor",     label: "Donor",     options: donors.map(d => ({ value: String(d.id), label: d.short_name || d.name })) },
          { key: "chain_level", label: "Level",   options: CHAIN_LEVELS.map(l => ({ value: l.key, label: l.label })) },
          { key: "rag", label: "Status", options: [
            { value: "green", label: "🟢 On track" },
            { value: "amber", label: "🟡 At risk" },
            { value: "red",   label: "🔴 Off track" },
            { value: "na",    label: "⚪ No data" },
          ]},
        ].map(({ key, options }) => (
          <Select
            key={key}
            variant="filter"
            style={{ width: 170 }}
            placeholder={FILTER_PLACEHOLDERS[key]}
            value={filters[key]}
            onChange={v => setFilter(key, v)}
            options={options.flatMap(o => o.children ? [
              { value: o.value, label: `All ${o.label}`, group: o.label },
              ...o.children.map(c => ({ value: c.value, label: c.label, group: o.label })),
            ] : [o])}
          />
        ))}

        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({ sector: "", chain_level: "", country: "", donor: "", rag: "" })}
            style={{
              height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600,
              border: "1px solid var(--rose-soft)", borderRadius: 8,
              background: "var(--sec-health-pale)", color: "var(--rose-darker)",
              fontFamily: "inherit", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name="x" size={12} /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--subtle)" }}>
          {isLoading ? "Loading…" : `${indicators.length} indicator${indicators.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* ── Erreur ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: 16, background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 10, color: "var(--rose-darker)", fontSize: 13, marginBottom: 20 }}>
          <Icon name="circle-x" size={14} style={{ marginRight: 8 }} />
          {JSON.stringify(error?.detail || error?.message)}
        </div>
      )}

      {/* ── Contenu ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--subtle)" }}>
          <span className="spinner" style={{ marginRight: 10 }} />
          Loading portfolio data…
        </div>
      ) : indicators.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center",
          background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 14,
        }}>
          <Icon name="bar-chart-2" size={32} style={{ color: "var(--rule)", display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
            No approved results yet
          </div>
          <div style={{ fontSize: 13, color: "var(--subtle)", maxWidth: 360, margin: "0 auto" }}>
            Ensure projects are Effective and results have been entered and approved in the Results section of each project.
          </div>
        </div>
      ) : (
        CHAIN_LEVELS.map(level => (
          <LevelSection
            key={level.key}
            level={level}
            indicators={byLevel[level.key] || []}
          />
        ))
      )}
    </div>
  );
}

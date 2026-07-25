/**
 * Portfolio — SF-4 Module 2
 * Vue agrégée des résultats sur l'ensemble du portefeuille LLF2.
 * Filtres : Hub · Secteur · Période · Niveau de chaîne
 * Drill-down par indicateur → ventilation par projet
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import { fmtNum, fmtPct } from "../utils.js";

const RAG_CONFIG = {
  green: { color: "#16a34a", bg: "#dcfce7", border: "#86efac", label: "On track",  icon: "circle-check" },
  amber: { color: "#d97706", bg: "#fef9c3", border: "#fde047", label: "At risk",   icon: "alert-triangle" },
  red:   { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", label: "Off track", icon: "circle-x" },
  na:    { color: "#9ca3af", bg: "#f3f4f6", border: "#e5e7eb", label: "No data",   icon: "minus" },
};

function RagBadge({ rag, rate }) {
  const cfg = RAG_CONFIG[rag] || RAG_CONFIG.na;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
    }}>
      <Icon name={cfg.icon} size={11} />
      {cfg.label}{rate ? ` · ${fmtPct(rate)}` : ""}
    </span>
  );
}

function RagSummaryBar({ summary }) {
  const total = (summary?.green || 0) + (summary?.amber || 0) + (summary?.red || 0) + (summary?.na || 0);
  if (!total) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {[
        { key: "green", label: "On track",  color: "#16a34a" },
        { key: "amber", label: "At risk",   color: "#d97706" },
        { key: "red",   label: "Off track", color: "#dc2626" },
        { key: "na",    label: "No data",   color: "#9ca3af" },
      ].map(({ key, label, color }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
          <strong style={{ color }}>{summary[key] || 0}</strong>
          <span style={{ color: "#6b7280" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

const CHAIN_LEVEL_LABELS = {
  activity:             "Activity",
  output:               "Output",
  immediate_outcome:    "Immediate Outcome",
  intermediate_outcome: "Intermediate Outcome",
  ultimate_outcome:     "Ultimate Outcome",
};

export default function Portfolio() {
  const [filters, setFilters] = useState({ hub: "", sector: "", period: "", chain_level: "" });
  const [expanded, setExpanded] = useState(null);

  const { data: hubs    = [] } = useQuery({ queryKey: ["hubs"],    queryFn: () => apiFetch("/api/reference/hubs/") });
  const { data: sectors = [] } = useQuery({ queryKey: ["sectors"], queryFn: () => apiFetch("/api/reference/sectors/") });

  const params = new URLSearchParams();
  if (filters.hub)         params.set("hub",         filters.hub);
  if (filters.sector)      params.set("sector",      filters.sector);
  if (filters.period)      params.set("period",      filters.period);
  if (filters.chain_level) params.set("chain_level", filters.chain_level);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portfolio-aggregation", filters],
    queryFn:  () => apiFetch(`/api/results/portfolio/?${params}`),
    staleTime: 60_000,
  });

  const meta       = data?.meta;
  const indicators = data?.indicators || [];

  // Grouper par chain_level
  const groups = {};
  indicators.forEach(ind => {
    const lvl = ind.chain_level || "output";
    if (!groups[lvl]) groups[lvl] = [];
    groups[lvl].push(ind);
  });

  const levelOrder = ["activity", "output", "immediate_outcome", "intermediate_outcome", "ultimate_outcome"];

  return (
    <div className="view">
      {/* Header */}
      <div className="view-header">
        <div className="view-eyebrow text-mono">Module 2 · SF-4</div>
        <h1 className="view-title">Portfolio Results</h1>
        <p className="view-lead">
          Aggregated results across the LLF2 portfolio. Only approved values are included.
        </p>
      </div>

      {/* Filtres */}
      <div className="card card-flush mb-4">
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Hub</label>
              <select className="field-select" value={filters.hub}
                onChange={e => setFilters(f => ({ ...f, hub: e.target.value }))}>
                <option value="">All hubs</option>
                {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Sector</label>
              <select className="field-select" value={filters.sector}
                onChange={e => setFilters(f => ({ ...f, sector: e.target.value }))}>
                <option value="">All sectors</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Chain level</label>
              <select className="field-select" value={filters.chain_level}
                onChange={e => setFilters(f => ({ ...f, chain_level: e.target.value }))}>
                <option value="">All levels</option>
                {levelOrder.map(l => (
                  <option key={l} value={l}>{CHAIN_LEVEL_LABELS[l]}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }}
                onClick={() => setFilters({ hub: "", sector: "", period: "", chain_level: "" })}>
                <Icon name="x" size={13} /> Clear filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Meta summary */}
      {meta && (
        <div className="card card-flush mb-4">
          <div className="card-body">
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{meta.projects_count}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Active projects</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{meta.indicators_count}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Indicators tracked</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#A4C53F" }}>{meta.with_data}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>With approved data</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>RAG distribution</div>
                <RagSummaryBar summary={meta.rag_summary} />
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="card card-flush"><div className="card-body">
          <span className="spinner" /> Loading portfolio data…
        </div></div>
      )}

      {error && (
        <div className="card card-flush"><div className="card-body" style={{ color: "#dc2626" }}>
          Error: {JSON.stringify(error?.detail || error?.message)}
        </div></div>
      )}

      {/* Indicateurs par niveau */}
      {!isLoading && levelOrder.map(lvl => {
        const group = groups[lvl];
        if (!group?.length) return null;
        return (
          <div key={lvl} className="card card-flush mb-3">
            <div className="card-header">
              <div>
                <h2 className="card-title">{CHAIN_LEVEL_LABELS[lvl]}</h2>
                <div className="card-sub">{group.length} indicator{group.length > 1 ? "s" : ""}</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f7f7f5", borderBottom: "2px solid #e5e5e2" }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#666" }}>Indicator</th>
                    <th style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#666" }}>Unit</th>
                    <th style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#666" }}>Rule</th>
                    <th style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#666" }}>Aggregated value</th>
                    <th style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#666" }}>RAG</th>
                    <th style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#666" }}>Projects</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {group.map(ind => (
                    <>
                      <tr key={ind.indicator_id}
                        style={{ borderBottom: expanded === ind.indicator_id ? "none" : "1px solid #f0f0ee", cursor: "pointer" }}
                        onClick={() => setExpanded(expanded === ind.indicator_id ? null : ind.indicator_id)}>
                        <td style={{ padding: "10px 14px" }}>
                          <span className="badge text-mono" style={{ fontSize: 10, marginRight: 6 }}>{ind.indicator_code}</span>
                          {ind.indicator_name.length > 70 ? ind.indicator_name.slice(0, 70) + "…" : ind.indicator_name}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 8px", color: "#666", fontSize: 11 }}>{ind.indicator_unit}</td>
                        <td style={{ textAlign: "center", padding: "10px 8px" }}>
                          <span style={{ fontSize: 10, background: "#f3f4f6", padding: "2px 8px", borderRadius: 99, color: "#6b7280" }}>
                            {ind.aggregation_rule}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700 }}>
                          {ind.aggregated_value != null ? fmtNum(ind.aggregated_value) : <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 8px" }}>
                          <RagBadge rag={ind.rag_status} rate={ind.achievement_rate} />
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 8px", color: "#666", fontSize: 12 }}>
                          {ind.projects_count}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 8px" }}>
                          <Icon name={expanded === ind.indicator_id ? "chevron-up" : "chevron-down"} size={14} style={{ color: "#9ca3af" }} />
                        </td>
                      </tr>
                      {/* Drill-down par projet */}
                      {expanded === ind.indicator_id && ind.breakdown.length > 0 && (
                        <tr key={`${ind.indicator_id}-breakdown`}>
                          <td colSpan={7} style={{ padding: "0 14px 12px", background: "#fafaf8", borderBottom: "1px solid #f0f0ee" }}>
                            <table style={{ width: "100%", fontSize: 12, marginTop: 8 }}>
                              <thead>
                                <tr style={{ color: "#9ca3af", fontSize: 11 }}>
                                  <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Project</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Hub</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Sector</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Value</th>
                                  <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 600 }}>RAG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ind.breakdown.map(b => (
                                  <tr key={b.project_id} style={{ borderTop: "1px solid #f0f0ee" }}>
                                    <td style={{ padding: "5px 8px" }}>
                                      <span className="text-mono" style={{ fontSize: 10, color: "#9ca3af", marginRight: 6 }}>{b.project_code}</span>
                                      {b.project_name}
                                    </td>
                                    <td style={{ padding: "5px 8px", color: "#6b7280" }}>{b.hub || "—"}</td>
                                    <td style={{ padding: "5px 8px", color: "#6b7280" }}>{b.sector || "—"}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtNum(b.actual_value)}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "center" }}>
                                      <RagBadge rag={b.rag_status} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {!isLoading && indicators.length === 0 && (
        <div className="card card-flush">
          <div className="card-body">
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No approved results data found in the portfolio.
              Ensure projects are Effective and results have been approved.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

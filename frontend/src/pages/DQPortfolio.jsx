/**
 * DQPortfolio — SF-9 Module 2
 * Vue agrégée du Data Quality Score · Filtres + méthodes de calcul
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { fmtNum } from "../utils.js";
import Icon from "../components/Icon";
import { DQScoreBadge } from "../components/DQScoreWidget";
import RefreshBar, { SkeletonRow, SkeletonCard } from "../components/RefreshBar.jsx";

const GRADE_CONFIG = {
  A: { color: "#16a34a", bg: "#dcfce7", label: "Excellent", range: "≥ 80%" },
  B: { color: "#A4C53F", bg: "#f0f6dc", label: "Good",      range: "60–79%" },
  C: { color: "#d97706", bg: "#fef9c3", label: "Fair",      range: "40–59%" },
  D: { color: "#dc2626", bg: "#fee2e2", label: "Poor",      range: "< 40%" },
};

const DIMENSIONS = [
  { key: "completeness", label: "Completeness", weight: "30%", color: "#1B5A8C" },
  { key: "timeliness",   label: "Timeliness",   weight: "25%", color: "#6366f1" },
  { key: "consistency",  label: "Consistency",  weight: "25%", color: "#d97706" },
  { key: "accuracy",     label: "Accuracy",     weight: "20%", color: "#9ca3af" },
];

const CHAIN_LEVEL_LABELS = {
  activity:             "Activity",
  output:               "Output",
  immediate_outcome:    "Immediate Outcome",
  intermediate_outcome: "Intermediate Outcome",
  ultimate_outcome:     "Ultimate Outcome",
};

function grade(score) {
  const n = parseFloat(score);
  if (n >= 80) return "A";
  if (n >= 60) return "B";
  if (n >= 40) return "C";
  return "D";
}

function MiniBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, parseFloat(value) || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: "#f0f0ee", borderRadius: 99, overflow: "hidden", minWidth: 50 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 36, textAlign: "right" }}>{fmtNum(pct)}%</span>
    </div>
  );
}

export default function DQPortfolio() {
  const [sortBy,      setSortBy]      = useState("composite_score");
  const [sortDir,     setSortDir]     = useState("desc");
  const [gradeFilter, setGradeFilter] = useState("");
  const [hubFilter,   setHubFilter]   = useState("");
  const [sectorFilter,setSectorFilter]= useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search,      setSearch]      = useState("");

  const [expandedRow, setExpandedRow] = useState(null);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dq-portfolio"],
    queryFn:  () => apiFetch("/api/results/dq-portfolio/"),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000, // Refresh auto toutes les 3 minutes
  });

  const allResults = data?.results || [];

  // Options de filtre dynamiques depuis les données
  const hubs    = useMemo(() => [...new Set(allResults.map(r => r.hub).filter(Boolean))].sort(), [allResults]);
  const sectors = useMemo(() => [...new Set(allResults.map(r => r.sector).filter(Boolean))].sort(), [allResults]);
  const levels  = useMemo(() => [...new Set(allResults.map(r => r.chain_level).filter(Boolean))].sort(), [allResults]);

  const filtered = useMemo(() => allResults
    .filter(r => !gradeFilter  || grade(r.composite_score) === gradeFilter)
    .filter(r => !hubFilter    || r.hub    === hubFilter)
    .filter(r => !sectorFilter || r.sector === sectorFilter)
    .filter(r => !levelFilter  || r.chain_level === levelFilter)
    .filter(r => !search       || r.indicator_name.toLowerCase().includes(search.toLowerCase())
                               || r.indicator_code.toLowerCase().includes(search.toLowerCase())
                               || r.project_code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = parseFloat(a[sortBy]) || 0;
      const vb = parseFloat(b[sortBy]) || 0;
      return sortDir === "desc" ? vb - va : va - vb;
    }), [allResults, gradeFilter, hubFilter, sectorFilter, levelFilter, search, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function clearFilters() {
    setGradeFilter(""); setHubFilter(""); setSectorFilter(""); setLevelFilter(""); setSearch("");
  }

  const avg     = parseFloat(data?.portfolio_average || 0);
  const gradeAvg = grade(avg);
  const cfgAvg   = GRADE_CONFIG[gradeAvg];
  const dist     = { A: 0, B: 0, C: 0, D: 0 };
  allResults.forEach(r => { dist[grade(r.composite_score)]++; });
  const hasFilter = gradeFilter || hubFilter || sectorFilter || levelFilter || search;

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · SF-9 · Data Quality</div>
        <h1 className="view-title">Data Quality Scores</h1>
        <p className="view-lead">
          Quality assessment across all indicators · Completeness · Timeliness · Consistency · Accuracy
        </p>
        <div style={{ marginTop: 8 }}>
          <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
        </div>
      </div>

      {/* ── KPI compact ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: 12, marginBottom: 20, overflow: "hidden",
      }}>
        {/* Score moyen */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: cfgAvg.bg,
          borderRight: `2px solid ${cfgAvg.color}30`, flexShrink: 0,
        }}>
          <span style={{
            width: 38, height: 38, borderRadius: "50%",
            background: cfgAvg.color, color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, flexShrink: 0,
          }}>{gradeAvg}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cfgAvg.color, lineHeight: 1 }}>{fmtNum(avg)}%</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, whiteSpace: "nowrap" }}>Portfolio avg · {allResults.length} indicator{allResults.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Séparateur label */}
        <div style={{ padding: "0 16px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
          Grade
        </div>

        {/* Distribution inline */}
        <div style={{ display: "flex", flex: 1, borderRight: "1px solid #f0f0ee" }}>
          {Object.entries(GRADE_CONFIG).map(([g, cfg]) => (
            <button key={g} onClick={() => setGradeFilter(f => f === g ? "" : g)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                padding: "12px 8px", gap: 2,
                background: gradeFilter === g ? cfg.bg : "transparent",
                borderLeft: `1px solid #f0f0ee`,
                borderTop: "none", borderRight: "none", borderBottom: "none",
                cursor: "pointer", transition: "background .15s",
              }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{dist[g]}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>Grade {g}</span>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>{cfg.range}</span>
            </button>
          ))}
        </div>

        {/* Count filtered */}
        <div style={{ padding: "14px 20px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111", lineHeight: 1 }}>{filtered.length}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{hasFilter ? "Filtered" : "Total"}</div>
        </div>
      </div>

      {/* ── Filtres ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "12px 16px", background: "#fff",
        border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 20,
      }}>
        <Icon name="filter" size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />

        {/* Recherche */}
        <input
          type="text" placeholder="Search indicator or project…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12,
            border: search ? "1px solid #A4C53F" : "1px solid #e5e7eb",
            borderRadius: 8, background: search ? "#f0f6dc" : "#f9fafb",
            fontFamily: "inherit", outline: "none", minWidth: 180,
          }}
        />

        {/* Hub */}
        {hubs.length > 0 && (
          <select style={selectStyle(hubFilter)} value={hubFilter} onChange={e => setHubFilter(e.target.value)}>
            <option value="">All Hubs</option>
            {hubs.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        )}

        {/* Sector */}
        {sectors.length > 0 && (
          <select style={selectStyle(sectorFilter)} value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Chain level */}
        {levels.length > 0 && (
          <select style={selectStyle(levelFilter)} value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
            <option value="">All Levels</option>
            {levels.map(l => <option key={l} value={l}>{CHAIN_LEVEL_LABELS[l] || l}</option>)}
          </select>
        )}

        {hasFilter && (
          <button onClick={clearFilters}
            style={{
              height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600,
              border: "1px solid #fca5a5", borderRadius: 8,
              background: "#fef2f2", color: "#dc2626",
              fontFamily: "inherit", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            <Icon name="x" size={12} /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {isLoading ? "Loading…" : `${filtered.length} of ${allResults.length}`}
        </div>
      </div>

      {/* ── Tableau ─────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
        {isLoading ? (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>{Array.from({length:5}).map((_,i) => <SkeletonRow key={i} cols={8} />)}</tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No indicators match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f7f7f5", borderBottom: "2px solid #e5e5e2" }}>
                  {[
                    { key: null,              label: "Indicator",    align: "left"  },
                    { key: null,              label: "Project",      align: "left"  },
                    { key: null,              label: "Level",        align: "left"  },
                    { key: "composite_score", label: "DQ Score",     align: "center"},
                    { key: "completeness",    label: "Completeness", align: "left"  },
                    { key: "timeliness",      label: "Timeliness",   align: "left"  },
                    { key: "consistency",     label: "Consistency",  align: "left"  },
                    { key: "accuracy",        label: "Accuracy",     align: "left"  },
                  ].map(({ key, label, align }) => (
                    <th key={label} onClick={key ? () => toggleSort(key) : undefined}
                      style={{
                        padding: "10px 12px", textAlign: align,
                        fontSize: 10, fontWeight: 700, color: "#666",
                        textTransform: "uppercase", letterSpacing: "0.07em",
                        cursor: key ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap",
                      }}>
                      {label}
                      {key && sortBy === key && (
                        <Icon name={sortDir === "desc" ? "chevron-down" : "chevron-up"} size={11}
                          style={{ marginLeft: 4, color: "#1B5A8C" }} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const rowKey = `${r.project_code}-${r.indicator_code}`;
                  const isExpanded = expandedRow === rowKey;
                  return (
                      <>
                        <tr key={rowKey}
                          onClick={() => setExpandedRow(k => k === rowKey ? null : rowKey)}
                          style={{
                            borderBottom: isExpanded ? "none" : "1px solid #f0f0ee",
                            background: i % 2 === 0 ? "#fff" : "#fafaf8",
                            cursor: "pointer", transition: "background .1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f0f6dc"}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafaf8"}
                        >
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={12} style={{ color: "#9ca3af", flexShrink: 0 }} />
                              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af", marginRight: 4 }}>{r.indicator_code}</span>
                              <span style={{ color: "#111" }}>{r.indicator_name.length > 48 ? r.indicator_name.slice(0,48)+"…" : r.indicator_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11, whiteSpace: "nowrap" }}>{r.project_code}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ fontSize: 10, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 99 }}>
                              {CHAIN_LEVEL_LABELS[r.chain_level] || r.chain_level || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <DQScoreBadge score={r.composite_score} />
                          </td>
                          {DIMENSIONS.map(dim => (
                            <td key={dim.key} style={{ padding: "10px 12px" }}>
                              <MiniBar value={r[dim.key]} color={dim.color} />
                            </td>
                          ))}
                        </tr>
                        {isExpanded && (
                          <tr key={`${rowKey}-detail`}>
                            <td colSpan={8} style={{ padding: "0 16px 16px", background: "#f8fafc", borderBottom: "1px solid #f0f0ee" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "12px 0 4px" }}>
                                {DIMENSIONS.map(dim => {
                                  const val = parseFloat(r[dim.key]);
                                  const g = grade(val);
                                  const cfg = GRADE_CONFIG[g];
                                  return (
                                    <div key={dim.key} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: dim.color }}>{dim.label}</span>
                                        <span style={{ fontSize: 10, color: "#9ca3af" }}>{dim.weight}</span>
                                      </div>
                                      <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, lineHeight: 1, marginBottom: 6 }}>
                                        {fmtNum(val)}%
                                      </div>
                                      <div style={{ height: 6, background: "#f0f0ee", borderRadius: 99, overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: `${Math.min(100,val)}%`, background: dim.color, borderRadius: 99 }} />
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 10, fontWeight: 600, color: cfg.color }}>
                                        Grade {g} — {cfg.label}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer — Méthodes de calcul ─────────────────────────────── */}
      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info-circle" size={14} style={{ color: "#1B5A8C" }} />
          Calculation Methods
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {[
            {
              label: "Completeness", weight: "30%", color: "#1B5A8C",
              formula: "Approved periods / Expected periods × 100",
              desc: "Measures the proportion of reporting periods for which approved data has been submitted. A period is counted if a ResultsData entry exists with status = 'approved'.",
            },
            {
              label: "Timeliness", weight: "25%", color: "#6366f1",
              formula: "On-time submissions / Total submissions × 100",
              desc: "Measures whether data was submitted before the period's due date. Submission date is the approval date if approved, otherwise the last update date.",
            },
            {
              label: "Consistency", weight: "25%", color: "#d97706",
              formula: "(Comparisons without anomaly / Total comparisons) × 100",
              desc: "Detects anomalous variations > 20% between consecutive approved values. Fewer anomalies = higher score. Insufficient data (< 2 periods) yields 100% by default.",
            },
            {
              label: "Accuracy", weight: "20%", color: "#9ca3af",
              formula: "Evidence verified / Total evidence attached × 100",
              desc: "Will reflect the rate of verified evidence attachments once SF-10 (Evidence Liaison) is activated. Currently set to 100% as a neutral placeholder.",
            },
          ].map(dim => (
            <div key={dim.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: dim.color }}>{dim.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: `${dim.color}15`, color: dim.color, padding: "2px 8px", borderRadius: 99 }}>
                  Weight {dim.weight}
                </span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, background: "#f0f6dc", padding: "6px 10px", borderRadius: 6, color: "#374151", marginBottom: 8 }}>
                {dim.formula}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{dim.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Composite Score</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, background: "#f0f6dc", display: "inline-block", padding: "6px 14px", borderRadius: 6, color: "#374151" }}>
            DQ Score = (Completeness × 0.30) + (Timeliness × 0.25) + (Consistency × 0.25) + (Accuracy × 0.20)
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(GRADE_CONFIG).map(([g, cfg]) => (
              <span key={g} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>
                Grade {g} — {cfg.label} ({cfg.range})
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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

/**
 * DQPortfolio — SF-9 Module 2
 * Vue agrégée du Data Quality Score · Filtres + méthodes de calcul
 */
import React, { useState, useMemo } from "react";
import Select from "../components/Select.jsx";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { fmtNum } from "../utils.js";
import Icon from "../components/Icon";
import ProjectTypeFilter, { useProjectType } from "../components/ProjectTypeFilter.jsx";
import { DQScoreBadge } from "../components/DQScoreWidget";
import RefreshBar, { SkeletonRow, SkeletonCard } from "../components/RefreshBar.jsx";

const GRADE_CONFIG = {
  A: { color: "var(--lime-darker)", bg: "var(--lime-pale)", label: "Excellent", range: "≥ 80%" },
  B: { color: "var(--lime-darker)", bg: "var(--lime-pale)", label: "Good",      range: "60–79%" },
  C: { color: "var(--orange-darker)", bg: "var(--sec-infra-pale)", label: "Fair",      range: "40–59%" },
  D: { color: "var(--rose-darker)", bg: "var(--rose-soft)", label: "Poor",      range: "< 40%" },
};

const DIMENSIONS = [
  { key: "completeness", label: "Completeness", weight: "30%", color: "var(--blue)" },
  { key: "timeliness",   label: "Timeliness",   weight: "25%", color: "var(--violet)" },
  { key: "consistency",  label: "Consistency",  weight: "25%", color: "var(--orange)" },
  { key: "accuracy",     label: "Accuracy",     weight: "20%", color: "var(--subtle)" },
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
      <div style={{ flex: 1, height: 5, background: "var(--rule)", borderRadius: 99, overflow: "hidden", minWidth: 50 }}>
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
  const [sectorFilter,setSectorFilter]= useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search,      setSearch]      = useState("");
  // One project type at a time (ADR 0014); its sectors are its own taxonomy.
  const [projectType, setProjectTypeState] = useProjectType();
  function setProjectType(value) {
    setProjectTypeState(value);
    setSectorFilter("");
  }

  const [expandedRow, setExpandedRow] = useState(null);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dq-portfolio", projectType],
    queryFn:  () => apiFetch(`/api/results/dq-portfolio/?type=${projectType}`),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000, // Refresh auto toutes les 3 minutes
  });

  const allResults = data?.results || [];

  // Options de filtre dynamiques depuis les données
  const sectors = useMemo(() => [...new Set(allResults.map(r => r.sector).filter(Boolean))].sort(), [allResults]);
  const levels  = useMemo(() => [...new Set(allResults.map(r => r.chain_level).filter(Boolean))].sort(), [allResults]);

  const filtered = useMemo(() => allResults
    .filter(r => !gradeFilter  || grade(r.composite_score) === gradeFilter)
    .filter(r => !sectorFilter || r.sector === sectorFilter)
    .filter(r => !levelFilter  || r.chain_level === levelFilter)
    .filter(r => !search       || r.indicator_name.toLowerCase().includes(search.toLowerCase())
                               || r.indicator_code.toLowerCase().includes(search.toLowerCase())
                               || r.project_code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = parseFloat(a[sortBy]) || 0;
      const vb = parseFloat(b[sortBy]) || 0;
      return sortDir === "desc" ? vb - va : va - vb;
    }), [allResults, gradeFilter, sectorFilter, levelFilter, search, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function clearFilters() {
    setGradeFilter(""); setSectorFilter(""); setLevelFilter(""); setSearch("");
  }

  const avg     = parseFloat(data?.portfolio_average || 0);
  const gradeAvg = grade(avg);
  const cfgAvg   = GRADE_CONFIG[gradeAvg];
  const dist     = { A: 0, B: 0, C: 0, D: 0 };
  allResults.forEach(r => { dist[grade(r.composite_score)]++; });
  // No hub filter: the hub is the session scope chosen in the top bar.
  const hasFilter = gradeFilter || sectorFilter || levelFilter || search;

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · Data Quality</div>
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
        background: "var(--paper)", border: "1px solid var(--rule)",
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
            background: cfgAvg.color, color: "var(--paper)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, flexShrink: 0,
          }}>{gradeAvg}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cfgAvg.color, lineHeight: 1 }}>{fmtNum(avg)}%</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap" }}>Portfolio avg · {allResults.length} indicator{allResults.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Séparateur label */}
        <div style={{ padding: "0 16px", fontSize: 10, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
          Grade
        </div>

        {/* Distribution inline */}
        <div style={{ display: "flex", flex: 1, borderRight: "1px solid var(--rule)" }}>
          {Object.entries(GRADE_CONFIG).map(([g, cfg]) => (
            <button key={g} onClick={() => setGradeFilter(f => f === g ? "" : g)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                padding: "12px 8px", gap: 2,
                background: gradeFilter === g ? cfg.bg : "transparent",
                borderLeft: `1px solid var(--rule)`,
                borderTop: "none", borderRight: "none", borderBottom: "none",
                cursor: "pointer", transition: "background .15s",
              }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{dist[g]}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>Grade {g}</span>
              <span style={{ fontSize: 9, color: "var(--subtle)" }}>{cfg.range}</span>
            </button>
          ))}
        </div>

        {/* Count filtered */}
        <div style={{ padding: "14px 20px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", lineHeight: 1 }}>{filtered.length}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{hasFilter ? "Filtered" : "Total"}</div>
        </div>
      </div>

      {/* ── Filtres ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "12px 16px", background: "var(--paper)",
        border: "1px solid var(--rule)", borderRadius: 10, marginBottom: 20,
      }}>
        <Icon name="filter" size={14} style={{ color: "var(--subtle)", flexShrink: 0 }} />

        <ProjectTypeFilter value={projectType} onChange={setProjectType} label="" />

        {/* Recherche */}
        <input
          type="text" placeholder="Search indicator or project…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            height: 32, padding: "0 10px", fontSize: 12,
            border: search ? "1px solid var(--lime)" : "1px solid var(--rule)",
            borderRadius: 8, background: search ? "var(--lime-pale)" : "var(--surface)",
            fontFamily: "inherit", outline: "none", minWidth: 180,
          }}
        />

        {/* Sector */}
        {sectors.length > 0 && (
          <Select variant="filter" style={{ width: 200 }} placeholder="All sectors"
            value={sectorFilter} onChange={setSectorFilter}
            options={sectors.map(s => ({ value: s, label: s }))} />
        )}

        {/* Chain level */}
        {levels.length > 0 && (
          <Select variant="filter" style={{ width: 180 }} placeholder="All levels"
            value={levelFilter} onChange={setLevelFilter}
            options={levels.map(l => ({ value: l, label: CHAIN_LEVEL_LABELS[l] || l }))} />
        )}

        {hasFilter && (
          <button onClick={clearFilters}
            style={{
              height: 32, padding: "0 12px", fontSize: 12, fontWeight: 600,
              border: "1px solid var(--rose-soft)", borderRadius: 8,
              background: "var(--sec-health-pale)", color: "var(--rose-darker)",
              fontFamily: "inherit", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            <Icon name="x" size={12} /> Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--subtle)" }}>
          {isLoading ? "Loading…" : `${filtered.length} of ${allResults.length}`}
        </div>
      </div>

      {/* ── Tableau ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
        {isLoading ? (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>{Array.from({length:5}).map((_,i) => <SkeletonRow key={i} cols={8} />)}</tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--subtle)", fontSize: 13 }}>
            No indicators match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "2px solid var(--surface-2)" }}>
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
                        fontSize: 10, fontWeight: 700, color: "var(--muted)",
                        textTransform: "uppercase", letterSpacing: "0.07em",
                        cursor: key ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap",
                      }}>
                      {label}
                      {key && sortBy === key && (
                        <Icon name={sortDir === "desc" ? "chevron-down" : "chevron-up"} size={11}
                          style={{ marginLeft: 4, color: "var(--blue)" }} />
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
                      <React.Fragment key={rowKey}>
                        <tr key={rowKey}
                          onClick={() => setExpandedRow(k => k === rowKey ? null : rowKey)}
                          style={{
                            borderBottom: isExpanded ? "none" : "1px solid var(--rule)",
                            background: i % 2 === 0 ? "var(--paper)" : "var(--surface)",
                            cursor: "pointer", transition: "background .1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--lime-pale)"}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "var(--paper)" : "var(--surface)"}
                        >
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={12} style={{ color: "var(--subtle)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--subtle)", marginRight: 4 }}>{r.indicator_code}</span>
                              <span style={{ color: "var(--ink)" }}>{r.indicator_name.length > 48 ? r.indicator_name.slice(0,48)+"…" : r.indicator_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{r.project_code}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ fontSize: 10, background: "var(--surface-2)", color: "var(--muted)", padding: "2px 8px", borderRadius: 99 }}>
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
                            <td colSpan={8} style={{ padding: "0 16px 16px", background: "var(--surface)", borderBottom: "1px solid var(--rule)" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "12px 0 4px" }}>
                                {DIMENSIONS.map(dim => {
                                  const val = parseFloat(r[dim.key]);
                                  const g = grade(val);
                                  const cfg = GRADE_CONFIG[g];
                                  return (
                                    <div key={dim.key} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 10, padding: "12px 14px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: dim.color }}>{dim.label}</span>
                                        <span style={{ fontSize: 10, color: "var(--subtle)" }}>{dim.weight}</span>
                                      </div>
                                      <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, lineHeight: 1, marginBottom: 6 }}>
                                        {fmtNum(val)}%
                                      </div>
                                      <div style={{ height: 6, background: "var(--rule)", borderRadius: 99, overflow: "hidden" }}>
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
                      </React.Fragment>
                    );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer — Méthodes de calcul ─────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info-circle" size={14} style={{ color: "var(--blue)" }} />
          Calculation Methods
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {[
            {
              label: "Completeness", weight: "30%", color: "var(--blue)",
              formula: "Approved periods / Expected periods × 100",
              desc: "Measures the proportion of reporting periods for which approved data has been submitted. A period is counted if a ResultsData entry exists with status = 'approved'.",
            },
            {
              label: "Timeliness", weight: "25%", color: "var(--violet)",
              formula: "On-time submissions / Total submissions × 100",
              desc: "Measures whether data was submitted before the period's due date. Submission date is the approval date if approved, otherwise the last update date.",
            },
            {
              label: "Consistency", weight: "25%", color: "var(--orange)",
              formula: "(Comparisons without anomaly / Total comparisons) × 100",
              desc: "Detects anomalous variations > 20% between consecutive approved values. Fewer anomalies = higher score. Insufficient data (< 2 periods) yields 100% by default.",
            },
            {
              label: "Accuracy", weight: "20%", color: "var(--subtle)",
              formula: "Evidence verified / Total evidence attached × 100",
              desc: "Will reflect the rate of verified evidence attachments once the evidence-verification workflow is activated. Currently set to 100% as a neutral placeholder.",
            },
          ].map(dim => (
            <div key={dim.label} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: dim.color }}>{dim.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: `${dim.color}15`, color: dim.color, padding: "2px 8px", borderRadius: 99 }}>
                  Weight {dim.weight}
                </span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, background: "var(--lime-pale)", padding: "6px 10px", borderRadius: 6, color: "var(--ink-soft)", marginBottom: 8 }}>
                {dim.formula}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{dim.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6 }}>Composite Score</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, background: "var(--lime-pale)", display: "inline-block", padding: "6px 14px", borderRadius: 6, color: "var(--ink-soft)" }}>
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

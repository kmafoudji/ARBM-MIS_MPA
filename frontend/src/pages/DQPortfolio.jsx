/**
 * DQPortfolio — SF-9 Module 2
 * Vue agrégée du Data Quality Score sur l'ensemble du portefeuille.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { fmtNum } from "../utils.js";
import Icon from "../components/Icon";
import { DQScoreBadge } from "../components/DQScoreWidget";

const GRADE_CONFIG = {
  A: { color: "#16a34a", bg: "#dcfce7", label: "Excellent ≥ 80%" },
  B: { color: "#A4C53F", bg: "#f0f6dc", label: "Good 60–79%" },
  C: { color: "#d97706", bg: "#fef9c3", label: "Fair 40–59%" },
  D: { color: "#dc2626", bg: "#fee2e2", label: "Poor < 40%" },
};

const DIMENSIONS = ["completeness", "timeliness", "consistency", "accuracy"];
const DIM_LABELS  = { completeness: "Completeness", timeliness: "Timeliness", consistency: "Consistency", accuracy: "Accuracy" };

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
      <div style={{ flex: 1, height: 5, background: "#f0f0ee", borderRadius: 99, overflow: "hidden", minWidth: 60 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 32, textAlign: "right" }}>{fmtNum(pct)}%</span>
    </div>
  );
}

export default function DQPortfolio() {
  const [sortBy, setSortBy] = useState("composite_score");
  const [sortDir, setSortDir] = useState("desc");
  const [gradeFilter, setGradeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dq-portfolio"],
    queryFn:  () => apiFetch("/api/results/dq-portfolio/"),
    staleTime: 60_000,
  });

  const results = (data?.results || [])
    .filter(r => !gradeFilter || grade(r.composite_score) === gradeFilter)
    .sort((a, b) => {
      const va = parseFloat(a[sortBy]) || 0;
      const vb = parseFloat(b[sortBy]) || 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  const avg = parseFloat(data?.portfolio_average || 0);
  const gradeAvg = grade(avg);
  const cfgAvg   = GRADE_CONFIG[gradeAvg];

  // Distribution par grade
  const dist = { A: 0, B: 0, C: 0, D: 0 };
  (data?.results || []).forEach(r => { dist[grade(r.composite_score)]++; });

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 2 · SF-9 · Data Quality</div>
        <h1 className="view-title">Data Quality Scores</h1>
        <p className="view-lead">
          Quality assessment across all indicators · Completeness · Timeliness · Consistency · Accuracy
        </p>
      </div>

      {/* KPI + Distribution */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Score moyen */}
        <div style={{
          flex: 1, minWidth: 180, background: cfgAvg.bg,
          border: `1px solid ${cfgAvg.color}40`,
          borderRadius: 14, padding: "18px 20px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{
            width: 48, height: 48, borderRadius: "50%",
            background: cfgAvg.color, color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, flexShrink: 0,
          }}>{gradeAvg}</span>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: cfgAvg.color, lineHeight: 1 }}>
              {fmtNum(avg)}%
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Portfolio average DQ Score</div>
          </div>
        </div>

        {/* Distribution grades */}
        <div style={{ flex: 2, minWidth: 280, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Grade Distribution
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(GRADE_CONFIG).map(([g, cfg]) => (
              <button key={g} onClick={() => setGradeFilter(f => f === g ? "" : g)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  padding: "8px 16px", borderRadius: 10,
                  background: gradeFilter === g ? cfg.bg : "#f9fafb",
                  border: `1px solid ${gradeFilter === g ? cfg.color : "#e5e7eb"}`,
                  cursor: "pointer", transition: "all .15s",
                }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: cfg.color }}>{dist[g]}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>Grade {g}</span>
                <span style={{ fontSize: 9, color: "#9ca3af" }}>{cfg.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "18px 20px", minWidth: 140 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#111", lineHeight: 1 }}>{data?.indicators_count ?? "—"}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Indicators assessed</div>
        </div>
      </div>

      {/* Tableau */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /> Loading DQ scores…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No indicators with DQ data.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f7f7f5", borderBottom: "2px solid #e5e5e2" }}>
                  {[
                    { key: null,                label: "Indicator",   w: "auto" },
                    { key: null,                label: "Project",     w: 120 },
                    { key: "composite_score",   label: "DQ Score",    w: 110 },
                    { key: "completeness",      label: "Completeness", w: 120 },
                    { key: "timeliness",        label: "Timeliness",  w: 120 },
                    { key: "consistency",       label: "Consistency", w: 120 },
                    { key: "accuracy",          label: "Accuracy",    w: 100 },
                  ].map(({ key, label, w }) => (
                    <th key={label}
                      onClick={key ? () => toggleSort(key) : undefined}
                      style={{
                        padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
                        color: "#666", textTransform: "uppercase", letterSpacing: "0.07em",
                        width: w, cursor: key ? "pointer" : "default", userSelect: "none",
                        whiteSpace: "nowrap",
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
                {results.map((r, i) => {
                  const g   = grade(r.composite_score);
                  const cfg = GRADE_CONFIG[g];
                  return (
                    <tr key={`${r.project_code}-${r.indicator_code}`}
                      style={{ borderBottom: "1px solid #f0f0ee", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af", marginRight: 6 }}>
                          {r.indicator_code}
                        </span>
                        <span style={{ color: "#111" }}>
                          {r.indicator_name.length > 55 ? r.indicator_name.slice(0, 55) + "…" : r.indicator_name}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11 }}>{r.project_code}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <DQScoreBadge score={r.composite_score} size="sm" />
                      </td>
                      {DIMENSIONS.map(dim => (
                        <td key={dim} style={{ padding: "10px 12px" }}>
                          <MiniBar value={r[dim]} color={GRADE_CONFIG[grade(r[dim])].color} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note SF-10 */}
      <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8, fontSize: 11, color: "#854d0e" }}>
        <Icon name="alert-triangle" size={12} style={{ marginRight: 6 }} />
        Accuracy dimension is currently set to 100% — it will reflect evidence verification rates once SF-10 (Evidence Liaison) is activated.
      </div>
    </div>
  );
}

/**
 * DQScoreWidget — SF-9 Module 2
 * Affiche le Data Quality Score pour un indicateur.
 * Réutilisable dans Logframe, PIRS, Portfolio.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { fmtNum } from "../utils.js";
import Icon from "./Icon";

const GRADE_CONFIG = {
  A: { color: "var(--lime-darker)", bg: "var(--lime-pale)", label: "Excellent", min: 80 },
  B: { color: "var(--lime-darker)", bg: "var(--lime-pale)", label: "Good",      min: 60 },
  C: { color: "var(--orange-darker)", bg: "var(--sec-infra-pale)", label: "Fair",      min: 40 },
  D: { color: "var(--rose-darker)", bg: "var(--rose-soft)", label: "Poor",      min: 0  },
};

function grade(score) {
  const n = parseFloat(score);
  if (n >= 80) return "A";
  if (n >= 60) return "B";
  if (n >= 40) return "C";
  return "D";
}

const DIMENSIONS = [
  { key: "completeness", label: "Completeness", weight: "30%", icon: "check",          desc: "Periods with approved data" },
  { key: "timeliness",   label: "Timeliness",   weight: "25%", icon: "calendar",       desc: "Submissions before deadline" },
  { key: "consistency",  label: "Consistency",  weight: "25%", icon: "trending-up",    desc: "No anomalous variations > 20%" },
  { key: "accuracy",     label: "Accuracy",     weight: "20%", icon: "circle-check",   desc: "Evidence verified" },
];

function ScoreBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, parseFloat(value) || 0));
  return (
    <div style={{ flex: 1, height: 6, background: "var(--rule)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .4s" }} />
    </div>
  );
}

export function DQScoreBadge({ score, size = "sm" }) {
  if (score == null) return null;
  const g   = grade(score);
  const cfg = GRADE_CONFIG[g];
  const isLg = size === "lg";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: isLg ? 8 : 4,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      borderRadius: 99,
      padding: isLg ? "6px 14px" : "2px 8px",
      fontSize: isLg ? 13 : 11, fontWeight: 700,
    }}>
      <span style={{ fontSize: isLg ? 16 : 12, fontWeight: 800 }}>{g}</span>
      <span style={{ fontSize: isLg ? 13 : 10 }}>{fmtNum(score)}%</span>
      {isLg && <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.8 }}>{cfg.label}</span>}
    </span>
  );
}

export default function DQScoreWidget({ projectId, rowId, inline = false }) {
  const [expanded, setExpanded] = useState(!inline);

  const { data, isLoading } = useQuery({
    queryKey: ["dq-score", projectId, rowId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/dq-score/`),
    staleTime: 120_000,
  });

  if (isLoading) return <span className="spinner" style={{ width: 14, height: 14 }} />;
  if (!data) return null;

  const scores = data.scores;
  const composite = parseFloat(scores.composite);
  const g   = grade(composite);
  const cfg = GRADE_CONFIG[g];

  if (inline) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <DQScoreBadge score={composite} />
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={12} style={{ color: "var(--subtle)" }} />
        {expanded && (
          <div style={{
            position: "absolute", zIndex: 100,
            background: "var(--paper)", border: "1px solid var(--rule)",
            borderRadius: 10, padding: 14, boxShadow: "var(--shadow-hover)",
            minWidth: 280, marginTop: 4,
          }}>
            <DQScoreDetail scores={scores} data={data} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: cfg.bg, borderBottom: `2px solid ${cfg.color}40`,
        cursor: "pointer",
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 36, height: 36, borderRadius: "50%",
            background: cfg.color, color: "var(--paper)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800,
          }}>{g}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: cfg.color }}>
              DQ Score — {fmtNum(composite)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {cfg.label} · {data.period}
            </div>
          </div>
        </div>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--subtle)" }} />
      </div>

      {/* Détail dimensions */}
      {expanded && (
        <div style={{ padding: "14px 16px" }}>
          <DQScoreDetail scores={scores} data={data} />
        </div>
      )}
    </div>
  );
}

function DQScoreDetail({ scores, data }) {
  return (
    <>
      {DIMENSIONS.map(dim => {
        const val = parseFloat(scores[dim.key]);
        const g   = grade(val);
        const cfg = GRADE_CONFIG[g];
        return (
          <div key={dim.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Icon name={dim.icon} size={13} style={{ color: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{dim.label}</span>
              <span style={{ fontSize: 10, color: "var(--subtle)" }}>{dim.weight}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, minWidth: 40, textAlign: "right" }}>
                {fmtNum(val)}%
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ScoreBar value={val} color={cfg.color} />
            </div>
            <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 2 }}>{dim.desc}</div>
          </div>
        );
      })}

      {/* Détails techniques */}
      {data.details && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Details
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            {[
              ["Periods expected", data.details.total_periods],
              ["Approved",         data.details.approved_count],
              ["On time",          `${data.details.on_time_count}/${data.details.submitted_count}`],
              ["Anomalies",        data.details.inconsistencies],
            ].map(([label, val]) => (
              <div key={label} style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                <span style={{ color: "var(--subtle)" }}>{label}: </span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: "var(--subtle)", fontStyle: "italic" }}>
        Accuracy will reflect evidence verification once that workflow is activated.
      </div>
    </>
  );
}

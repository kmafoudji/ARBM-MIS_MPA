/**
 * SF-3 — Diagramme de Gantt interactif (RG-3.1 / BRQ-3.15)
 * SVG custom — pas de dépendance externe.
 *
 * Fonctionnalités :
 *  - Zoom Semaine / Mois / Trimestre
 *  - Barres colorées par statut + chemin critique
 *  - Marqueurs losange pour les jalons
 *  - Ligne "aujourd'hui"
 *  - Baseline en fond semi-transparent
 *  - Click sur barre → callback onActivityClick
 *  - Performance : rendu < 5s jusqu'à 500 activités (RG-3.3)
 */

import { useMemo, useRef, useState } from "react";
import Icon from "./Icon";

// ─── Constantes de mise en page ───────────────────────────────────────────────
const ROW_H        = 36;   // hauteur d'une ligne activité
const LABEL_W      = 220;  // largeur de la colonne labels
const BAR_H        = 18;   // hauteur d'une barre activité
const BAR_Y_OFFSET = (ROW_H - BAR_H) / 2;
const HEADER_H     = 48;   // hauteur de l'en-tête timeline
const MILESTONE_R  = 7;    // rayon losange jalon

// ─── Couleurs par statut ──────────────────────────────────────────────────────
const STATUS_FILL = {
  not_started: "#cbd5e1",
  in_progress:  "#3b82f6",
  on_hold:      "#f59e0b",
  completed:    "#22c55e",
  cancelled:    "#ef4444",
};
const STATUS_STROKE = {
  not_started: "#94a3b8",
  in_progress:  "#2563eb",
  on_hold:      "#d97706",
  completed:    "#16a34a",
  cancelled:    "#dc2626",
};

// ─── Utilitaires date ─────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  return new Date(str + "T00:00:00");
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1); // lundi
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date) {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}

function fmtDate(date, zoom) {
  if (zoom === "week") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (zoom === "month") {
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// ─── Zoom config ──────────────────────────────────────────────────────────────
const ZOOM_CONFIG = {
  week:    { pxPerDay: 20, tickFn: startOfWeek,    advanceDays: 7   },
  month:   { pxPerDay: 4,  tickFn: startOfMonth,   advanceDays: 30  },
  quarter: { pxPerDay: 1.4, tickFn: startOfQuarter, advanceDays: 90 },
};

// ─── Flatten activities from workplan hierarchy ───────────────────────────────
function flattenActivities(components) {
  const rows = [];
  for (const comp of components) {
    rows.push({ type: "component", id: `c-${comp.id}`, label: `${comp.code} — ${comp.name}`, comp });
    for (const sub of comp.sub_components || []) {
      rows.push({ type: "subcomponent", id: `s-${sub.id}`, label: `  ${sub.code} — ${sub.name}`, sub });
      for (const act of sub.activities || []) {
        if (act.is_active === false) continue;
        rows.push({ type: "activity", id: `a-${act.id}`, label: `    ${act.code} — ${act.name}`, act });
      }
    }
  }
  return rows;
}

// ─── GanttChart ──────────────────────────────────────────────────────────────

export default function GanttChart({ components = [], onActivityClick }) {
  const [zoom, setZoom]       = useState("month");
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollRef = useRef(null);
  const today = useMemo(() => new Date(), []);

  const rows = useMemo(() => flattenActivities(components), [components]);

  // Calcul de la plage de dates
  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = null, max = null;
    for (const row of rows) {
      if (row.type !== "activity") continue;
      const s = parseDate(row.act.planned_start);
      const e = parseDate(row.act.revised_end || row.act.planned_end);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    }
    if (!min) min = today;
    if (!max) max = addDays(today, 90);
    // Padding
    min = addDays(min, -7);
    max = addDays(max, 14);
    return { rangeStart: min, rangeEnd: max };
  }, [rows, today]);

  const cfg      = ZOOM_CONFIG[zoom];
  const totalDays = daysBetween(rangeStart, rangeEnd);
  const gridW    = Math.max(totalDays * cfg.pxPerDay, 400);
  const totalH   = rows.length * ROW_H;

  // Génération des ticks de l'en-tête
  const ticks = useMemo(() => {
    const result = [];
    let cur = cfg.tickFn(rangeStart);
    while (cur <= rangeEnd) {
      const x = daysBetween(rangeStart, cur) * cfg.pxPerDay;
      result.push({ date: new Date(cur), x });
      cur = addDays(cur, cfg.advanceDays);
    }
    return result;
  }, [rangeStart, rangeEnd, cfg]);

  // Position X de "aujourd'hui"
  const todayX = daysBetween(rangeStart, today) * cfg.pxPerDay;

  function xOf(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return 0;
    return daysBetween(rangeStart, d) * cfg.pxPerDay;
  }

  function wOf(startStr, endStr) {
    const s = parseDate(startStr);
    const e = parseDate(endStr);
    if (!s || !e) return 0;
    return Math.max(daysBetween(s, e) * cfg.pxPerDay, 4);
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
        <Icon name="layout" size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>No activities to display</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Add components and activities in the List view first.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>Zoom</span>
        {["week", "month", "quarter"].map(z => (
          <button key={z} onClick={() => setZoom(z)} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderColor: zoom === z ? "#A4C53F" : "#e2e8f0",
            background: zoom === z ? "#f7ffe6" : "#fff",
            color: zoom === z ? "#4a7c0a" : "#64748b",
          }}>
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Legend */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {Object.entries(STATUS_FILL).map(([k, color]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748b" }}>
              <div style={{ width: 12, height: 8, borderRadius: 2, background: color }} />
              {k.replace("_", " ")}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9333ea" }}>
            <svg width={12} height={12} viewBox="0 0 12 12">
              <polygon points="6,0 12,6 6,12 0,6" fill="#9333ea" />
            </svg>
            Milestone
          </div>
        </div>
      </div>

      {/* ── Gantt body ── */}
      <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>

        {/* Left: label column */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid #e2e8f0", background: "#fafafa" }}>
          {/* Header spacer */}
          <div style={{ height: HEADER_H, borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }} />
          {/* Row labels */}
          {rows.map((row, i) => {
            const isComp = row.type === "component";
            const isSub  = row.type === "subcomponent";
            return (
              <div key={row.id} style={{
                height: ROW_H,
                display: "flex", alignItems: "center",
                padding: isComp ? "0 8px" : isSub ? "0 8px 0 16px" : "0 8px 0 28px",
                borderBottom: "1px solid #f1f5f9",
                background: isComp ? "#1B5A8C" : isSub ? "#f1f5f9" : "#fff",
                cursor: row.type === "activity" ? "pointer" : "default",
              }}
              onClick={() => row.type === "activity" && onActivityClick && onActivityClick(row.act)}>
                <span style={{
                  fontSize: isComp ? 11 : isSub ? 11 : 12,
                  fontWeight: isComp ? 700 : isSub ? 600 : 400,
                  color: isComp ? "#fff" : isSub ? "#374151" : "#1e293b",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: LABEL_W - (isComp ? 16 : isSub ? 24 : 36),
                }}>
                  {isComp ? `${row.comp.code} — ${row.comp.name}` :
                   isSub  ? `${row.sub.code} — ${row.sub.name}`  :
                   `${row.act.code} — ${row.act.name}`}
                </span>
                {row.type === "activity" && row.act.is_critical_path && (
                  <span style={{ marginLeft: 4, color: "#9333ea", fontSize: 9 }}>◆</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: scrollable timeline */}
        <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}
          onScroll={e => setScrollLeft(e.target.scrollLeft)}>
          <svg
            width={gridW}
            height={HEADER_H + totalH}
            style={{ display: "block" }}
          >
            {/* ── Background grid ── */}
            <rect width={gridW} height={HEADER_H + totalH} fill="#fff" />

            {/* Alternating row backgrounds */}
            {rows.map((row, i) => (
              <rect key={`bg-${row.id}`}
                x={0} y={HEADER_H + i * ROW_H}
                width={gridW} height={ROW_H}
                fill={row.type === "component" ? "#e8f0f8"
                    : row.type === "subcomponent" ? "#f8f9fa"
                    : i % 2 === 0 ? "#fff" : "#fafafa"}
              />
            ))}

            {/* Vertical tick lines */}
            {ticks.map((tick, i) => (
              <line key={i} x1={tick.x} y1={HEADER_H} x2={tick.x} y2={HEADER_H + totalH}
                stroke="#e2e8f0" strokeWidth={1} />
            ))}

            {/* Horizontal row lines */}
            {rows.map((row, i) => (
              <line key={`hl-${row.id}`}
                x1={0} y1={HEADER_H + (i + 1) * ROW_H}
                x2={gridW} y2={HEADER_H + (i + 1) * ROW_H}
                stroke="#f1f5f9" strokeWidth={1} />
            ))}

            {/* ── Header ticks ── */}
            <rect x={0} y={0} width={gridW} height={HEADER_H} fill="#f8fafc" />
            <line x1={0} y1={HEADER_H} x2={gridW} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={1} />
            {ticks.map((tick, i) => (
              <g key={`tick-${i}`}>
                <line x1={tick.x} y1={32} x2={tick.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={1} />
                <text x={tick.x + 4} y={28} fontSize={10} fill="#64748b" fontWeight={600}>
                  {fmtDate(tick.date, zoom)}
                </text>
              </g>
            ))}

            {/* ── Today line ── */}
            {todayX >= 0 && todayX <= gridW && (
              <g>
                <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H + totalH}
                  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
                <rect x={todayX - 18} y={4} width={36} height={16} rx={4} fill="#ef4444" />
                <text x={todayX} y={16} fontSize={9} fill="#fff" textAnchor="middle" fontWeight={700}>TODAY</text>
              </g>
            )}

            {/* ── Activity bars ── */}
            {rows.map((row, i) => {
              if (row.type !== "activity") return null;
              const act = row.act;
              const y   = HEADER_H + i * ROW_H + BAR_Y_OFFSET;

              const startStr = act.planned_start;
              const endStr   = act.revised_end || act.planned_end;
              if (!startStr || !endStr) return null;

              const x = xOf(startStr);
              const w = wOf(startStr, endStr);
              const fill   = STATUS_FILL[act.status]   || "#cbd5e1";
              const stroke = STATUS_STROKE[act.status] || "#94a3b8";

              // Baseline bar (si différente)
              const hasBaseline = act.baseline_end && act.baseline_end !== act.planned_end;

              // Progress fill
              const progressW = Math.max((act.progress / 100) * w, 0);

              // Milestones positions
              const milestones = act.milestones || [];

              return (
                <g key={row.id} style={{ cursor: "pointer" }}
                  onClick={() => onActivityClick && onActivityClick(act)}>

                  {/* Baseline ghost bar */}
                  {hasBaseline && (
                    <rect
                      x={xOf(startStr)}
                      y={y + BAR_H - 4}
                      width={wOf(startStr, act.baseline_end)}
                      height={4}
                      rx={2}
                      fill="#94a3b8"
                      opacity={0.35}
                    />
                  )}

                  {/* Main bar background */}
                  <rect x={x} y={y} width={w} height={BAR_H} rx={4}
                    fill={fill} opacity={0.25} />

                  {/* Progress fill */}
                  {progressW > 0 && (
                    <rect x={x} y={y} width={progressW} height={BAR_H} rx={4}
                      fill={fill} opacity={0.9} />
                  )}

                  {/* Bar border */}
                  <rect x={x} y={y} width={w} height={BAR_H} rx={4}
                    fill="none" stroke={stroke} strokeWidth={act.is_critical_path ? 2 : 1}
                    strokeDasharray={act.status === "cancelled" ? "4,2" : "none"}
                  />

                  {/* Critical path marker */}
                  {act.is_critical_path && (
                    <rect x={x} y={y} width={3} height={BAR_H} rx={2} fill="#9333ea" />
                  )}

                  {/* Overdue indicator */}
                  {act.is_overdue && (
                    <rect x={x + w - 4} y={y} width={4} height={BAR_H}
                      rx={2} fill="#ef4444" opacity={0.8} />
                  )}

                  {/* Progress % label */}
                  {w > 30 && (
                    <text x={x + w / 2} y={y + BAR_H / 2 + 4}
                      fontSize={9} fill={act.progress > 50 ? "#fff" : stroke}
                      textAnchor="middle" fontWeight={700} opacity={0.9}>
                      {act.progress}%
                    </text>
                  )}

                  {/* Milestone diamonds */}
                  {milestones.map(ms => {
                    const mx = xOf(ms.planned_date);
                    if (mx < 0 || mx > gridW) return null;
                    const my = y + BAR_H / 2;
                    const msColor = ms.status === "achieved" ? "#16a34a"
                      : ms.status === "missed" ? "#dc2626"
                      : "#9333ea";
                    return (
                      <g key={ms.id}>
                        <polygon
                          points={`${mx},${my - MILESTONE_R} ${mx + MILESTONE_R},${my} ${mx},${my + MILESTONE_R} ${mx - MILESTONE_R},${my}`}
                          fill={msColor}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                        {ms.is_gate && (
                          <circle cx={mx} cy={my} r={2} fill="#fff" />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Footer hint ── */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#94a3b8", paddingLeft: 4 }}>
        <span>◆ <span style={{ color: "#9333ea" }}>Critical path</span></span>
        <span>— Baseline (grey underline)</span>
        <span><span style={{ color: "#ef4444" }}>Red end</span> = overdue</span>
        <span>Click a bar to open activity details</span>
      </div>
    </div>
  );
}

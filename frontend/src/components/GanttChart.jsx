/**
 * SF-3 — Diagramme de Gantt interactif v2
 * - Tooltip dynamique au survol
 * - Colonne labels redimensionnable (drag)
 * - Scroll vertical synchronisé labels ↔ timeline
 * - Row highlight au survol
 * - Dates affichées sur barres (zoom Month+)
 * - Ellipsis + title natif sur tous les labels
 * - Mini-nav en bas pour la position dans la timeline
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

// ─── Layout constants ─────────────────────────────────────────────────────────
const ROW_H        = 38;
const BAR_H        = 20;
const BAR_Y_OFFSET = (ROW_H - BAR_H) / 2;
const HEADER_H     = 52;
const MILESTONE_R  = 8;
const MIN_LABEL_W  = 160;
const MAX_LABEL_W  = 420;
const DEFAULT_LABEL_W = 260;

// ─── Status palette ───────────────────────────────────────────────────────────
const S = {
  not_started: { fill: "#ECEBE8", stroke: "#A7A7A7", text: "Not Started" },
  in_progress:  { fill: "#0089C5", stroke: "#0089C5", text: "In Progress" },
  on_hold:      { fill: "#F49D07", stroke: "#F49D07", text: "On Hold"     },
  completed:    { fill: "#0EB584", stroke: "#0EB584", text: "Completed"   },
  cancelled:    { fill: "#FB563B", stroke: "#FB563B", text: "Cancelled"   },
};

const MILESTONE_COLOR = {
  pending:    "#7E46B8",
  achieved:   "#0EB584",
  missed:     "#FB563B",
  forecasted: "#0089C5",
};

// ─── Zoom config ──────────────────────────────────────────────────────────────
const ZOOM = {
  week:    { px: 24,  tickDays: 7,  fmt: d => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) },
  month:   { px: 5,   tickDays: 30, fmt: d => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) },
  quarter: { px: 1.8, tickDays: 90, fmt: d => `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}` },
};

// ─── Date utils ───────────────────────────────────────────────────────────────
const pd    = s => s ? new Date(s + "T00:00:00") : null;
const addD  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffD = (a, b) => Math.round((b - a) / 86400000);
const fmtD  = d => d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function tickStart(date, zoom) {
  const d = new Date(date);
  if (zoom === "week")    { d.setDate(d.getDate() - d.getDay() + 1); return d; }
  if (zoom === "month")   return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

// ─── Flatten hierarchy ────────────────────────────────────────────────────────
function flatten(components) {
  const rows = [];
  for (const c of components) {
    rows.push({ kind: "comp", id: `c${c.id}`, label: `${c.code} — ${c.name}`, obj: c });
    for (const s of c.sub_components || []) {
      rows.push({ kind: "sub", id: `s${s.id}`, label: `${s.code} — ${s.name}`, obj: s });
      for (const a of s.activities || []) {
        if (a.is_active === false) continue;
        rows.push({ kind: "act", id: `a${a.id}`, label: `${a.code} — ${a.name}`, obj: a });
      }
    }
  }
  return rows;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "fixed", zIndex: 9999, pointerEvents: "none",
      left: tip.x + 16, top: tip.y - 10,
      background: "#2B2B2B", color: "#FFFFFF", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, lineHeight: 1.6,
      boxShadow: "0 4px 20px rgba(0,0,0,.25)", maxWidth: 280,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#0EB584" }}>{tip.title}</div>
      {tip.lines.map((l, i) => <div key={i} style={{ color: "#ECEBE8" }}>{l}</div>)}
    </div>
  );
}

// ─── GanttChart ──────────────────────────────────────────────────────────────
export default function GanttChart({ components = [], onActivityClick }) {
  const [zoom,      setZoom]      = useState("month");
  const [labelW,    setLabelW]    = useState(DEFAULT_LABEL_W);
  const [hoveredId, setHoveredId] = useState(null);
  const [tip,       setTip]       = useState(null);
  const [scrollTop, setScrollTop] = useState(0);

  const labelScrollRef    = useRef(null);
  const timelineScrollRef = useRef(null);
  const dragging          = useRef(false);
  const dragStartX        = useRef(0);
  const dragStartW        = useRef(0);
  const today             = useMemo(() => new Date(), []);

  const rows = useMemo(() => flatten(components), [components]);
  const cfg  = ZOOM[zoom];

  // ── Date range ──────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = null, max = null;
    for (const r of rows) {
      if (r.kind !== "act") continue;
      const s = pd(r.obj.planned_start);
      const e = pd(r.obj.revised_end || r.obj.planned_end);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    }
    if (!min) min = today;
    if (!max) max = addD(today, 90);
    return { rangeStart: addD(min, -7), rangeEnd: addD(max, 21) };
  }, [rows, today]);

  const totalDays = diffD(rangeStart, rangeEnd);
  const gridW     = Math.max(totalDays * cfg.px, 600);
  const gridH     = rows.length * ROW_H;

  // ── Ticks ───────────────────────────────────────────────────────────────────
  const ticks = useMemo(() => {
    const out = [];
    let cur = tickStart(rangeStart, zoom);
    while (cur <= rangeEnd) {
      out.push({ date: new Date(cur), x: diffD(rangeStart, cur) * cfg.px });
      cur = addD(cur, cfg.tickDays);
    }
    return out;
  }, [rangeStart, rangeEnd, zoom, cfg]);

  const todayX = diffD(rangeStart, today) * cfg.px;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const xOf = s => { const d = pd(s); return d ? diffD(rangeStart, d) * cfg.px : 0; };
  const wOf = (s, e) => { const a = pd(s), b = pd(e); return a && b ? Math.max(diffD(a, b) * cfg.px, 4) : 0; };

  // ── Synchronized scroll ─────────────────────────────────────────────────────
  const syncingLabel    = useRef(false);
  const syncingTimeline = useRef(false);

  const onLabelScroll = useCallback(e => {
    if (syncingTimeline.current) return;
    syncingLabel.current = true;
    if (timelineScrollRef.current) timelineScrollRef.current.scrollTop = e.target.scrollTop;
    setScrollTop(e.target.scrollTop);
    syncingLabel.current = false;
  }, []);

  const onTimelineScroll = useCallback(e => {
    if (syncingLabel.current) return;
    syncingTimeline.current = true;
    if (labelScrollRef.current) labelScrollRef.current.scrollTop = e.target.scrollTop;
    setScrollTop(e.target.scrollTop);
    syncingTimeline.current = false;
  }, []);

  // ── Drag resize label column ────────────────────────────────────────────────
  const onDragStart = useCallback(e => {
    dragging.current  = true;
    dragStartX.current = e.clientX;
    dragStartW.current = labelW;
    e.preventDefault();
  }, [labelW]);

  useEffect(() => {
    const move = e => {
      if (!dragging.current) return;
      const nw = dragStartW.current + (e.clientX - dragStartX.current);
      setLabelW(Math.min(MAX_LABEL_W, Math.max(MIN_LABEL_W, nw)));
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // ── Tooltip handlers ────────────────────────────────────────────────────────
  const showTip = useCallback((e, title, lines) => {
    setTip({ x: e.clientX, y: e.clientY, title, lines });
  }, []);
  const moveTip = useCallback(e => {
    setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  if (rows.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#A7A7A7" }}>
        <Icon name="bar-chart-2" size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#7E7E7E", marginBottom: 4 }}>No activities to display</div>
        <div style={{ fontSize: 12 }}>Add components and activities in the List view first.</div>
      </div>
    );
  }

  const MAX_VISIBLE_H = 520; // px max before scroll

  return (
    <div style={{ userSelect: "none" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#A7A7A7", textTransform: "uppercase", letterSpacing: "0.05em" }}>Zoom</span>
        {["week", "month", "quarter"].map(z => (
          <button key={z} onClick={() => setZoom(z)} style={{
            padding: "4px 14px", borderRadius: 6, border: "1.5px solid",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderColor: zoom === z ? "#0EB584" : "#ECEBE8",
            background: zoom === z ? "#EFFFFA" : "#FFFFFF",
            color: zoom === z ? "#09815F" : "#7E7E7E",
          }}>
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Legend */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {Object.entries(S).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#7E7E7E" }}>
              <div style={{ width: 14, height: 8, borderRadius: 2, background: v.fill, border: `1px solid ${v.stroke}` }} />
              {v.text}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#7E46B8" }}>
            <svg width={12} height={12}><polygon points="6,0 12,6 6,12 0,6" fill="#7E46B8" /></svg>
            Milestone
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#7E46B8" }}>
            <div style={{ width: 3, height: 14, background: "#7E46B8", borderRadius: 2 }} />
            Critical path
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: "flex", border: "1px solid #ECEBE8", borderRadius: 10, overflow: "hidden" }}>

        {/* Label column */}
        <div style={{ width: labelW, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "2px solid #ECEBE8", background: "#fafafa" }}>
          {/* Header */}
          <div style={{ height: HEADER_H, background: "#F7F6F6", borderBottom: "1px solid #ECEBE8", display: "flex", alignItems: "center", padding: "0 12px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7E7E7E", textTransform: "uppercase", letterSpacing: "0.05em" }}>Activity</span>
          </div>
          {/* Scrollable labels */}
          <div ref={labelScrollRef} onScroll={onLabelScroll}
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden", maxHeight: MAX_VISIBLE_H }}>
            {rows.map((row, i) => {
              const isComp = row.kind === "comp";
              const isSub  = row.kind === "sub";
              const isAct  = row.kind === "act";
              const hovered = hoveredId === row.id;
              return (
                <div key={row.id}
                  title={row.label}
                  onClick={() => isAct && onActivityClick && onActivityClick(row.obj)}
                  onMouseEnter={() => { setHoveredId(row.id); }}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    height: ROW_H,
                    display: "flex", alignItems: "center",
                    padding: isComp ? "0 10px" : isSub ? "0 10px 0 20px" : "0 10px 0 32px",
                    borderBottom: "1px solid #F7F6F6",
                    background: isComp ? "#0089C5"
                              : isSub  ? (hovered ? "#ECEBE8" : "#F7F6F6")
                              : (hovered ? "#DBF4FF" : (i % 2 === 0 ? "#FFFFFF" : "#fafafa")),
                    cursor: isAct ? "pointer" : "default",
                    transition: "background .1s",
                  }}>
                  {isComp && <Icon name="layers" size={11} style={{ color: "rgba(255,255,255,.6)", marginRight: 6, flexShrink: 0 }} />}
                  {isSub  && <Icon name="git-branch" size={11} style={{ color: "#A7A7A7", marginRight: 6, flexShrink: 0 }} />}
                  {isAct  && <Icon name="activity" size={11} style={{ color: "#7E7E7E", marginRight: 6, flexShrink: 0 }} />}
                  <span style={{
                    fontSize: isComp ? 11 : 12,
                    fontWeight: isComp ? 700 : isSub ? 600 : 400,
                    color: isComp ? "#FFFFFF" : isSub ? "#545454" : "#2B2B2B",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1,
                  }}>
                    {isAct && row.obj.is_critical_path
                      ? <><span style={{ color: "#7E46B8", marginRight: 4 }}>◆</span>{row.label}</>
                      : row.label}
                  </span>
                  {isAct && row.obj.is_overdue && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: "#FB563B", fontWeight: 700, flexShrink: 0 }}>!</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Drag handle */}
        <div onMouseDown={onDragStart} style={{
          width: 5, cursor: "col-resize", background: "transparent",
          flexShrink: 0, position: "relative", zIndex: 10,
          transition: "background .15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#0EB584"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        />

        {/* Timeline */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Fixed header */}
          <div style={{ overflowX: "auto", overflowY: "hidden", flexShrink: 0 }}
            id="gantt-header-scroll">
            <svg width={gridW} height={HEADER_H} style={{ display: "block" }}>
              <rect width={gridW} height={HEADER_H} fill="#FAFAFA" />
              {/* Month/quarter background bands */}
              {ticks.map((tick, i) => {
                const nextX = ticks[i + 1]?.x ?? gridW;
                const isEven = i % 2 === 0;
                return (
                  <rect key={i} x={tick.x} y={0} width={nextX - tick.x} height={HEADER_H}
                    fill={isEven ? "#FAFAFA" : "#F7F6F6"} />
                );
              })}
              {/* Tick lines and labels */}
              {ticks.map((tick, i) => (
                <g key={i}>
                  <line x1={tick.x} y1={36} x2={tick.x} y2={HEADER_H} stroke="#ECEBE8" strokeWidth={1} />
                  <text x={tick.x + 6} y={30} fontSize={11} fill="#545454" fontWeight={600}>
                    {cfg.fmt(tick.date)}
                  </text>
                </g>
              ))}
              {/* Today marker in header */}
              {todayX >= 0 && todayX <= gridW && (
                <>
                  <rect x={todayX - 20} y={36} width={40} height={16} rx={4} fill="#FB563B" />
                  <text x={todayX} y={48} fontSize={9} fill="#FFFFFF" textAnchor="middle" fontWeight={700}>TODAY</text>
                </>
              )}
              <line x1={0} y1={HEADER_H - 1} x2={gridW} y2={HEADER_H - 1} stroke="#ECEBE8" strokeWidth={1} />
            </svg>
          </div>

          {/* Scrollable body */}
          <div ref={timelineScrollRef} onScroll={onTimelineScroll}
            style={{ overflowX: "auto", overflowY: "auto", flex: 1, maxHeight: MAX_VISIBLE_H }}
            id="gantt-body-scroll">
            <svg width={gridW} height={gridH} style={{ display: "block" }}
              onMouseMove={moveTip} onMouseLeave={hideTip}>

              {/* Row backgrounds */}
              {rows.map((row, i) => {
                const isComp  = row.kind === "comp";
                const isSub   = row.kind === "sub";
                const hovered = hoveredId === row.id;
                return (
                  <rect key={`bg${row.id}`}
                    x={0} y={i * ROW_H} width={gridW} height={ROW_H}
                    fill={isComp ? "#DBF4FF"
                        : isSub  ? "#F7F6F6"
                        : hovered ? "#DBF4FF"
                        : i % 2 === 0 ? "#FFFFFF" : "#fafafa"}
                  />
                );
              })}

              {/* Vertical grid lines */}
              {ticks.map((tick, i) => (
                <line key={`vl${i}`} x1={tick.x} y1={0} x2={tick.x} y2={gridH}
                  stroke="#ECEBE8" strokeWidth={1} strokeDasharray={zoom === "week" ? "none" : "3,3"} />
              ))}

              {/* Horizontal row lines */}
              {rows.map((row, i) => (
                <line key={`hl${row.id}`}
                  x1={0} y1={(i + 1) * ROW_H} x2={gridW} y2={(i + 1) * ROW_H}
                  stroke="#F7F6F6" strokeWidth={1} />
              ))}

              {/* Today line */}
              {todayX >= 0 && todayX <= gridW && (
                <line x1={todayX} y1={0} x2={todayX} y2={gridH}
                  stroke="#FB563B" strokeWidth={1.5} strokeDasharray="5,4" opacity={0.7} />
              )}

              {/* Activity bars */}
              {rows.map((row, i) => {
                if (row.kind !== "act") return null;
                const act = row.obj;
                const pal = S[act.status] || S.not_started;
                const y   = i * ROW_H + BAR_Y_OFFSET;

                const startStr = act.planned_start;
                const endStr   = act.revised_end || act.planned_end;
                if (!startStr || !endStr) return null;

                const x  = xOf(startStr);
                const w  = wOf(startStr, endStr);
                const pw = Math.max((act.progress / 100) * w, 0);

                // Baseline
                const hasBaseline = act.baseline_end && act.baseline_end !== (act.revised_end || act.planned_end);
                const bw = hasBaseline ? wOf(startStr, act.baseline_end) : 0;

                const milestones = act.milestones || [];
                const hovered = hoveredId === row.id;

                return (
                  <g key={row.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => {
                      setHoveredId(row.id);
                      const lines = [
                        "Status: " + pal.text + " · " + act.progress + "%",
                        "Start: " + fmtD(pd(act.planned_start)),
                        "End: " + fmtD(pd(act.revised_end || act.planned_end)),
                        act.baseline_end ? "Baseline end: " + fmtD(pd(act.baseline_end)) : null,
                        act.responsible_party ? "Responsible: " + act.responsible_party : null,
                        act.budget_planned > 0 ? "Budget: " + Number(act.budget_planned).toLocaleString() + " USD" : null,
                        act.is_critical_path ? "◆ Critical path" : null,
                        act.is_overdue ? "⚠ Overdue by " + (act.schedule_variance_days || "?") + " days" : null,
                      ].filter(Boolean);
                      showTip(e, act.code + " — " + act.name, lines);
                    }}
                    onMouseLeave={() => { setHoveredId(null); hideTip(); }}
                    onClick={() => onActivityClick && onActivityClick(act)}>

                    {/* Baseline ghost */}
                    {hasBaseline && (
                      <rect x={x} y={y + BAR_H} width={bw} height={3} rx={1.5}
                        fill="#A7A7A7" opacity={0.4} />
                    )}

                    {/* Bar shadow */}
                    {hovered && (
                      <rect x={x - 1} y={y - 1} width={w + 2} height={BAR_H + 2} rx={5}
                        fill="none" stroke="#0EB584" strokeWidth={2} opacity={0.7} />
                    )}

                    {/* Bar background */}
                    <rect x={x} y={y} width={w} height={BAR_H} rx={4}
                      fill={pal.fill} opacity={act.status === "not_started" ? 0.5 : 0.25} />

                    {/* Progress fill */}
                    {pw > 0 && (
                      <rect x={x} y={y} width={pw} height={BAR_H} rx={4}
                        fill={pal.fill} opacity={act.status === "not_started" ? 0.3 : 0.9} />
                    )}

                    {/* Bar border */}
                    <rect x={x} y={y} width={w} height={BAR_H} rx={4}
                      fill="none" stroke={pal.stroke} strokeWidth={hovered ? 2 : 1}
                      strokeDasharray={act.status === "cancelled" ? "4,2" : "none"} />

                    {/* Critical path left accent */}
                    {act.is_critical_path && (
                      <rect x={x} y={y} width={3} height={BAR_H} rx={2} fill="#7E46B8" />
                    )}

                    {/* Overdue right accent */}
                    {act.is_overdue && (
                      <rect x={x + w - 4} y={y} width={4} height={BAR_H}
                        rx={2} fill="#FB563B" opacity={0.85} />
                    )}

                    {/* Progress label */}
                    {w > 36 && (
                      <text x={x + Math.min(pw, w) / 2} y={y + BAR_H / 2 + 4}
                        fontSize={9} fontWeight={700} textAnchor="middle"
                        fill={act.progress > 50 ? "#FFFFFF" : pal.stroke} opacity={0.95}>
                        {act.progress}%
                      </text>
                    )}

                    {/* End date label (month+ zoom) */}
                    {zoom !== "week" && w > 60 && (
                      <text x={x + w + 4} y={y + BAR_H / 2 + 4}
                        fontSize={9} fill="#7E7E7E" dominantBaseline="middle">
                        {pd(endStr)?.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </text>
                    )}

                    {/* Milestone diamonds */}
                    {milestones.map(ms => {
                      const mx = xOf(ms.planned_date);
                      if (mx < x - 20 || mx > gridW) return null;
                      const my = y + BAR_H / 2;
                      const mc = MILESTONE_COLOR[ms.status] || "#7E46B8";
                      return (
                        <g key={ms.id}
                          onMouseEnter={e => {
                            const lines = [
                              "Category: " + ms.category,
                              "Planned: " + fmtD(pd(ms.planned_date)),
                              "Status: " + ms.status,
                              ms.is_gate ? "🔒 Gate milestone" : null,
                            ].filter(Boolean);
                            showTip(e, "Milestone: " + ms.name, lines);
                          }}
                          onMouseLeave={hideTip}>
                          <polygon
                            points={`${mx},${my - MILESTONE_R} ${mx + MILESTONE_R},${my} ${mx},${my + MILESTONE_R} ${mx - MILESTONE_R},${my}`}
                            fill={mc} stroke="#FFFFFF" strokeWidth={1.5} />
                          {ms.is_gate && <circle cx={mx} cy={my} r={2.5} fill="#FFFFFF" />}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#A7A7A7", alignItems: "center" }}>
        <span>Drag the divider to resize the label column</span>
        <span>·</span>
        <span><span style={{ color: "#FB563B" }}>Red right edge</span> = overdue</span>
        <span>·</span>
        <span>Grey underline = baseline shift</span>
        <span>·</span>
        <span>Click any bar to open activity details</span>
      </div>

      <Tooltip tip={tip} />
    </div>
  );
}

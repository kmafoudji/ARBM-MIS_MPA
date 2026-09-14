/**
 * Module 3 — Workplan
 * SF-1: Component → Sub-Component → Activity hierarchy
 * SF-2: Activity → Output (ToC M2) link
 * SF-4: Status & progress tracking
 * SF-5: Milestones
 * SF-7: Delay log
 */

import { useState } from "react";
import Select from "../components/Select.jsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import GanttChart from "../components/GanttChart";
import MultiAnnualPlan from "../components/workplan/MultiAnnualPlan";
import ActivityMilestones from "../components/workplan/ActivityMilestones";
import DelayLogTable from "../components/workplan/DelayLogTable";
import NotTrackedView from "../components/workplan/NotTrackedView";

// Strip HTML tags for plain text display (e.g. in <option> elements)
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// ─── Status config ────────────────────────────────────────────────────────────

// LLF status mapping (design.md §2.4): good = green, mixed = blue,
// attention = yellow, problematic = coral; tints from the tonal scales.
const STATUS_COLORS = {
  not_started: { bg: "var(--surface-2)", text: "var(--muted)", border: "var(--subtle)", label: "Not Started" },
  in_progress:  { bg: "var(--sec-climate-pale)", text: "var(--blue)", border: "var(--blue-soft)", label: "In Progress" },
  on_hold:      { bg: "var(--sec-infra-pale)", text: "var(--orange)", border: "var(--orange-soft)", label: "On Hold" },
  completed:    { bg: "var(--lime-pale)", text: "var(--lime)", border: "var(--lime-soft)", label: "Completed" },
  cancelled:    { bg: "var(--sec-health-pale)", text: "var(--rose)", border: "var(--rose-soft)", label: "Cancelled" },
};

const MILESTONE_STATUS_COLORS = {
  pending:    { bg: "var(--surface-2)", text: "var(--muted)" },
  achieved:   { bg: "var(--lime-pale)", text: "var(--lime)" },
  missed:     { bg: "var(--sec-health-pale)", text: "var(--rose)" },
  forecasted: { bg: "var(--sec-climate-pale)", text: "var(--blue)" },
};

const DELAY_CATEGORIES = [
  { value: "procurement",   label: "Procurement" },
  { value: "customs",       label: "Customs / Clearance" },
  { value: "weather",       label: "Weather / Environment" },
  { value: "land",          label: "Land & Tenure" },
  { value: "security",      label: "Security / Conflict" },
  { value: "budget",        label: "Budget Constraint" },
  { value: "contractor",    label: "Contractor Non-Performance" },
  { value: "technical",     label: "Design / Technical" },
  { value: "counterpart",   label: "Counterpart Performance" },
  { value: "force_majeure", label: "Force Majeure" },
  { value: "other",         label: "Other" },
];

const ACTIVITY_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress",  label: "In Progress" },
  { value: "on_hold",      label: "On Hold" },
  { value: "completed",    label: "Completed" },
  { value: "cancelled",    label: "Cancelled" },
];

// The three tones an alert can carry, worst first. A collapsed panel shows
// this breakdown rather than a bare count: "18 alerts" says nothing about
// whether any of them needs the coordinator today.
const ALERT_SEVERITY = [
  { key: "high",   label: "escalated",  color: "var(--rose)",   types: ["escalation_l3", "escalation_l2", "milestone_missed"] },
  { key: "medium", label: "overdue",    color: "var(--orange)", types: ["escalation_l1", "activity_overdue", "milestone_t0"] },
  { key: "low",    label: "upcoming",   color: "var(--muted)",  types: ["milestone_t7", "milestone_t30", "delay_pending"] },
];

function summariseAlerts(alerts) {
  const known = ALERT_SEVERITY.flatMap(level => level.types);
  const levels = ALERT_SEVERITY.map(level => ({
    ...level,
    count: alerts.filter(a => level.types.includes(a.alert_type)).length,
  }));
  // A type the backend adds later must not vanish from the count: the
  // breakdown has to add up to the headline figure, always.
  const other = alerts.filter(a => !known.includes(a.alert_type)).length;
  if (other) levels.push({ key: "other", label: "other", color: "var(--muted)", count: other });
  return levels.filter(level => level.count > 0);
}

// SF-6 alert tones. Hoisted out of the render: rebuilding the map on every
// pass cost a fresh object per alert for a table that never changes.
const ALERT_COLORS = {
  escalation_l3:    { bg: "var(--sec-health-pale)", border: "var(--rose-soft)", text: "var(--rose)", icon: "alert-triangle" },
  escalation_l2:    { bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", text: "var(--orange)", icon: "alert-triangle" },
  escalation_l1:    { bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", text: "var(--orange)", icon: "alert-triangle" },
  milestone_missed: { bg: "var(--sec-health-pale)", border: "var(--rose-soft)", text: "var(--rose)", icon: "circle-x" },
  activity_overdue: { bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", text: "var(--orange)", icon: "clock" },
  milestone_t0:     { bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", text: "var(--orange)", icon: "clock" },
  milestone_t7:     { bg: "var(--sec-climate-pale)", border: "var(--blue-soft)", text: "var(--blue)", icon: "info" },
  milestone_t30:    { bg: "var(--surface)", border: "var(--rule)", text: "var(--muted)", icon: "info" },
  delay_pending:    { bg: "var(--sec-women-pale)", border: "var(--violet-soft)", text: "var(--violet)", icon: "clock" },
};

const MILESTONE_CATEGORIES = [
  { value: "contractual",  label: "Contractual" },
  { value: "programmatic", label: "Programmatic" },
  { value: "reporting",    label: "Reporting" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

function ProgressBar({ value, status }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--rule)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: `${value}%`, height: "100%", borderRadius: 3, transition: "width .3s ease",
          background: status === "completed" ? "var(--lime)" : status === "on_hold" ? "var(--orange)" : status === "cancelled" ? "var(--rose)" : "var(--blue)",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", minWidth: 28 }}>{value}%</span>
    </div>
  );
}

function OverduePill() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700,
      background: "var(--sec-health-pale)", color: "var(--rose-darker)", border: "1px solid var(--rose-soft)",
    }}>
      <Icon name="alert-circle" size={9} /> OVERDUE
    </span>
  );
}

function SummaryCard({ icon, label, value, accent }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--subtle)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Icon name={icon} size={12} />{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || "var(--ink)" }}>{value}</div>
    </div>
  );
}

// ─── Component Form ───────────────────────────────────────────────────────────

const fieldStyle = { display: "flex", flexDirection: "column", gap: 5 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" };
const inputStyle = { padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 6, fontSize: 13, color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" };
const textareaStyle = { ...inputStyle, resize: "vertical", fontFamily: "inherit" };

function ComponentForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ code: "", name: "", description: "", order: 0 });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    if (!form.code.trim()) { setErr("Code is required."); return; }
    if (!form.name.trim()) { setErr("Name is required."); return; }
    try { await onSave(form); }
    catch (e) {
      const detail = e?.detail || e?.message;
      const msg = typeof detail === "object" ? JSON.stringify(detail) : detail;
      setErr(msg || "Save failed.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={{ padding: "8px 12px", background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 6, fontSize: 13, color: "var(--rose-darker)" }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Code *</label>
          <input style={inputStyle} value={form.code} onChange={e => set("code", e.target.value)} placeholder="C1" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Agricultural Productivity" />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Description <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span></label>
        <textarea style={{ ...textareaStyle, minHeight: 72 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description of this component..." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="plus" size={14} /> Create Component</button>
      </div>
    </div>
  );
}

// ─── Sub-Component Form ───────────────────────────────────────────────────────

function SubComponentForm({ componentId, componentName, onSave, onCancel }) {
  const [form, setForm] = useState({ code: "", name: "", description: "", order: 0, component: componentId });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    if (!form.code.trim()) { setErr("Code is required."); return; }
    if (!form.name.trim()) { setErr("Name is required."); return; }
    try { await onSave(form); }
    catch (e) {
      const detail = e?.detail || e?.message;
      const msg = typeof detail === "object" ? JSON.stringify(detail) : detail;
      setErr(msg || "Save failed.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Parent component badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--sec-climate-pale)", borderRadius: 8, border: "1px solid var(--blue-soft)" }}>
        <Icon name="layers" size={13} style={{ color: "var(--blue)" }} />
        <span style={{ fontSize: 12, color: "var(--blue)" }}>
          <strong>Component:</strong> {componentName || `#${componentId}`}
        </span>
      </div>

      {err && <div style={{ padding: "8px 12px", background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 6, fontSize: 13, color: "var(--rose-darker)" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Code *</label>
          <input style={inputStyle} value={form.code} onChange={e => set("code", e.target.value)} placeholder="C1.1" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Input Distribution" />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Description <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span></label>
        <textarea style={{ ...textareaStyle, minHeight: 72 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description of this sub-component..." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="plus" size={14} /> Create Sub-Component</button>
      </div>
    </div>
  );
}

// ─── Activity Form ────────────────────────────────────────────────────────────

const SECTION = {
  display: "flex", flexDirection: "column", gap: 10,
  padding: "14px 16px", borderRadius: 10,
  border: "1px solid var(--rule)", background: "var(--surface)",
};
const SECTION_TITLE = {
  fontSize: 10, fontWeight: 700, color: "var(--subtle)",
  textTransform: "uppercase", letterSpacing: "0.07em",
  marginBottom: 2,
};

function ActivityForm({ subComponentId, outputNodes, users = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    code: "", name: "", description: "", responsible_party: "",
    responsible_user: null,
    planned_start: "", planned_end: "", status: "not_started", progress: 0,
    requires_evidence: false, is_critical_path: false,
    output_node: "", budget_planned: "", order: 0,
    sub_component: subComponentId,
  });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    if (!form.code.trim())   { setErr("Code is required."); return; }
    if (!form.name.trim())   { setErr("Name is required."); return; }
    if (!form.planned_start) { setErr("Planned start date is required."); return; }
    if (!form.planned_end)   { setErr("Planned end date is required."); return; }
    try {
      await onSave({ ...form, output_node: form.output_node || null, budget_planned: form.budget_planned || 0, progress: Number(form.progress), order: Number(form.order) });
    } catch (e) {
      const d = e?.detail;
      const msg = typeof d === "string" ? d : d ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ") : "Save failed.";
      setErr(msg);
    }
  }

  const selectedOutput = outputNodes.find(n => String(n.id) === String(form.output_node));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {err && (
        <div style={{ padding: "8px 12px", background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 6, fontSize: 13, color: "var(--rose-darker)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="alert-circle" size={13} /> {err}
        </div>
      )}

      {/* ── Identity ── */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Identity</div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Code *</label>
            <input style={inputStyle} value={form.code} onChange={e => set("code", e.target.value)} placeholder="A1.1.1" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Activity Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Procurement of improved seeds" />
          </div>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Description <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span></label>
          <textarea style={{ ...textareaStyle, minHeight: 52 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Operational details..." />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Responsible Party</label>
          <Select
            placeholder="— Select —"
            value={form.responsible_user != null ? String(form.responsible_user) : (form.responsible_party ? "__external__" : "")}
            onChange={val => {
              if (!val) { set("responsible_user", null); set("responsible_party", ""); }
              else if (val === "__external__") { set("responsible_user", null); if (!form.responsible_party) set("responsible_party", " "); }
              else {
                const u = users.find(u => String(u.id) === val);
                set("responsible_user", Number(val));
                set("responsible_party", u ? (u.full_name || u.email) : "");
              }
            }}
            options={[
              ...users.map(u => ({ value: String(u.id), label: u.full_name || u.email })),
              { value: "__external__", label: "⤷ External / Other (free text)" },
            ]} />
          {form.responsible_user != null && (
            <div style={{ fontSize: 11, color: "var(--blue-darker)", padding: "4px 8px", background: "var(--sec-climate-pale)", borderRadius: 6, border: "1px solid var(--blue-soft)", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Icon name="user" size={11} />
              {users.find(u => u.id === form.responsible_user)?.email}
            </div>
          )}
          {form.responsible_user == null && form.responsible_party !== "" && (
            <input style={{ ...inputStyle, marginTop: 6 }}
              value={form.responsible_party.trim()}
              onChange={e => set("responsible_party", e.target.value)}
              placeholder="Organization, contractor or individual name..." />
          )}
        </div>
      </div>

      {/* ── Schedule ── */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Schedule</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Planned Start *</label>
            <input style={inputStyle} type="date" value={form.planned_start} onChange={e => set("planned_start", e.target.value)} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Planned End *</label>
            <input style={inputStyle} type="date" value={form.planned_end} onChange={e => set("planned_end", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <Select required value={form.status} onChange={v => set("status", v)} options={ACTIVITY_STATUSES} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Progress %</label>
            <input style={inputStyle} type="number" min={0} max={100} value={form.progress} onChange={e => set("progress", e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Results Link ── */}
      <div style={{ ...SECTION, borderColor: outputNodes.length > 0 ? "var(--lime-soft)" : "var(--rule)", background: outputNodes.length > 0 ? "var(--lime-pale)" : "var(--surface)" }}>
        <div style={{ ...SECTION_TITLE, color: outputNodes.length > 0 ? "var(--lime)" : "var(--subtle)" }}>
          Results link — Theory of Change output
        </div>
        {outputNodes.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--subtle)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="info" size={13} />
            No Output nodes defined in the Theory of Change yet. You can link this activity later.
          </div>
        ) : (
          <>
            <Select placeholder="— No output linked —" value={form.output_node} onChange={v => set("output_node", v)}
              options={outputNodes.map(n => ({
                value: n.id,
                label: `${n.code} · ${stripHtml(n.statement).substring(0, 60)}${stripHtml(n.statement).length > 60 ? "…" : ""}`,
              }))} />
            {selectedOutput && (
              <div style={{ fontSize: 12, color: "var(--lime-darker)", marginTop: 4, padding: "6px 10px", background: "var(--lime-pale)", borderRadius: 6 }}>
                ↳ {stripHtml(selectedOutput.statement)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Budget & Flags ── */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Budget & Flags</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Planned Budget (USD) <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span></label>
          <input style={{ ...inputStyle, maxWidth: 200 }} type="number" min={0} value={form.budget_planned} onChange={e => set("budget_planned", e.target.value)} placeholder="0" />
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={form.requires_evidence} onChange={e => set("requires_evidence", e.target.checked)} />
            <span>
              <strong>Evidence required</strong>
              <span style={{ color: "var(--subtle)", marginLeft: 4, fontSize: 11 }}>before Completed</span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={form.is_critical_path} onChange={e => set("is_critical_path", e.target.checked)} />
            <span>
              <strong>Critical path</strong>
              <span style={{ color: "var(--subtle)", marginLeft: 4, fontSize: 11 }}>◆</span>
            </span>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="plus" size={14} /> Save Activity</button>
      </div>
    </div>
  );
}

// ─── Milestone Form ───────────────────────────────────────────────────────────

function MilestoneForm({ activityId, onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", category: "programmatic", planned_date: "", status: "pending", is_gate: false, evidence_url: "", activity: activityId });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    if (!form.name.trim()) { setErr("Milestone name is required."); return; }
    if (!form.planned_date) { setErr("Planned date is required."); return; }
    try { await onSave(form); }
    catch (e) {
      const d = e?.detail;
      setErr(typeof d === "string" ? d : d ? Object.entries(d).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(", "):v}`).join(" | ") : "Save failed.");
    }
  }

  const MILESTONE_STATUS_OPTS = [
    { value: "pending",    label: "Pending",    icon: "⏳" },
    { value: "achieved",   label: "Achieved",   icon: "✅" },
    { value: "missed",     label: "Missed",     icon: "❌" },
    { value: "forecasted", label: "Forecasted", icon: "🔮" },
  ];

  const CAT_ICONS = { contractual: "📋", programmatic: "🎯", reporting: "📊" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {err && (
        <div style={{ padding: "8px 12px", background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 6, fontSize: 13, color: "var(--rose-darker)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="alert-circle" size={13} /> {err}
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle}>Milestone Name *</label>
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Study report submitted" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Category</label>
          <Select required value={form.category} onChange={v => set("category", v)}
            options={MILESTONE_CATEGORIES.map(c => ({ value: c.value, label: `${CAT_ICONS[c.value]} ${c.label}` }))} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Planned Date *</label>
          <input style={inputStyle} type="date" value={form.planned_date} onChange={e => set("planned_date", e.target.value)} />
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Status</label>
        <div style={{ display: "flex", gap: 8 }}>
          {MILESTONE_STATUS_OPTS.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => set("status", opt.value)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 8, border: "2px solid",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                borderColor: form.status === opt.value ? "var(--lime)" : "var(--rule)",
                background: form.status === opt.value ? "var(--lime-pale)" : "var(--paper)",
                color: form.status === opt.value ? "var(--lime-darker)" : "var(--muted)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
              <span style={{ fontSize: 16 }}>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Evidence URL <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span></label>
        <input style={inputStyle} type="url" value={form.evidence_url} onChange={e => set("evidence_url", e.target.value)} placeholder="https://..." />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--sec-women-pale)", border: "1px solid var(--violet-soft)", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--ink-soft)" }}>
        <input type="checkbox" checked={form.is_gate} onChange={e => set("is_gate", e.target.checked)} />
        <div>
          <strong>Gate milestone</strong>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>Blocks this activity from reaching 100% until achieved</div>
        </div>
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="check" size={14} /> Save Milestone</button>
      </div>
    </div>
  );
}

// ─── Delay Form ───────────────────────────────────────────────────────────────

function DelayForm({ activity, onSave, onCancel }) {
  const [form, setForm] = useState({ previous_end: activity.revised_end || activity.planned_end || "", revised_end: "", delay_category: "procurement", delay_subcategory: "", justification: "", cascade_applied: false });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    if (!form.revised_end) { setErr("New end date is required."); return; }
    if (!form.justification.trim()) { setErr("A justification is required to record a delay."); return; }
    try { await onSave(form); }
    catch (e) {
      const d = e?.detail;
      setErr(typeof d === "string" ? d : d ? Object.entries(d).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(", "):v}`).join(" | ") : "Save failed.");
    }
  }

  const variance = form.revised_end && form.previous_end
    ? Math.round((new Date(form.revised_end) - new Date(form.previous_end)) / 86400000)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {err && (
        <div style={{ padding: "8px 12px", background: "var(--sec-health-pale)", border: "1px solid var(--rose-soft)", borderRadius: 6, fontSize: 13, color: "var(--rose-darker)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="alert-circle" size={13} /> {err}
        </div>
      )}

      {/* Context banner */}
      <div style={{ padding: "12px 14px", background: "var(--sec-infra-pale)", border: "1px solid var(--orange-soft)", borderRadius: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Activity Timeline</div>
        <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 600, textTransform: "uppercase" }}>Baseline</div>
            <div style={{ fontWeight: 600, color: "var(--orange)" }}>{activity.baseline_end || activity.planned_end}</div>
          </div>
          <div style={{ color: "var(--orange-soft)", fontSize: 18, alignSelf: "center" }}>→</div>
          <div>
            <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 600, textTransform: "uppercase" }}>Current End</div>
            <div style={{ fontWeight: 600, color: "var(--orange)" }}>{activity.revised_end || activity.planned_end}</div>
          </div>
          {variance !== null && (
            <>
              <div style={{ color: "var(--orange-soft)", fontSize: 18, alignSelf: "center" }}>→</div>
              <div>
                <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 600, textTransform: "uppercase" }}>New End</div>
                <div style={{ fontWeight: 700, color: variance > 0 ? "var(--rose)" : "var(--lime)" }}>
                  {form.revised_end} {variance > 0 ? `(+${variance}d)` : variance < 0 ? `(${variance}d)` : "(no change)"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dates */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Previous End Date</label>
          <input style={inputStyle} type="date" value={form.previous_end} onChange={e => set("previous_end", e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={{ ...labelStyle, color: "var(--rose)" }}>New End Date *</label>
          <input style={{ ...inputStyle, borderColor: form.revised_end ? "var(--rule)" : "var(--rose-soft)" }} type="date" value={form.revised_end} onChange={e => set("revised_end", e.target.value)} />
        </div>
      </div>

      {/* Delay category */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Delay Category * <span style={{ color: "var(--subtle)", fontWeight: 400, fontSize: 11 }}>(pick from the fund’s standard list)</span></label>
        <Select required value={form.delay_category} onChange={v => set("delay_category", v)} options={DELAY_CATEGORIES} />
      </div>

      {/* Justification */}
      <div style={fieldStyle}>
        <label style={{ ...labelStyle, color: "var(--rose)" }}>Justification *</label>
        <textarea style={{ ...textareaStyle, minHeight: 80, borderColor: form.justification.trim() ? "var(--rule)" : "var(--rose-soft)" }}
          value={form.justification} onChange={e => set("justification", e.target.value)}
          placeholder="Mandatory narrative: describe the root cause, impact, and corrective actions taken..." />
        <span style={{ fontSize: 11, color: "var(--subtle)" }}>{form.justification.length} characters</span>
      </div>

      {/* Cascade */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--sec-infra-pale)", border: "1px solid var(--orange-soft)", borderRadius: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={form.cascade_applied} onChange={e => set("cascade_applied", e.target.checked)} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--orange)" }}>Apply cascade to successor activities</div>
          <div style={{ fontSize: 11, color: "var(--orange)" }}>Automatically shift dependent activities by the same delay</div>
        </div>
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="alert-triangle" size={14} /> Record Delay</button>
      </div>
    </div>
  );
}

// ─── Activity Detail Panel ────────────────────────────────────────────────────

function ActivityDetailPanel({ projectId, activity, outputNodes, onClose, onRefresh }) {
  const [activeSection, setActiveSection] = useState("info");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // { title, content }

  const { data: milestones = [], refetch: refetchMilestones } = useQuery({
    queryKey: ["milestones", activity.id],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/activities/${activity.id}/milestones/`),
  });
  const { data: delays = [], refetch: refetchDelays } = useQuery({
    queryKey: ["delays", activity.id],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/activities/${activity.id}/delays/`),
  });

  const updateProgress = useMutation({
    mutationFn: ({ status, progress }) => apiFetch(
      `/api/projects/${projectId}/workplan/activities/${activity.id}/progress/`,
      { method: "PATCH", body: JSON.stringify({ status, progress }) }
    ),
    onSuccess: () => { onRefresh(); setToast({ type: "success", message: "Progress updated." }); },
    onError: (e) => setToast({ type: "error", message: e?.detail || "Update failed." }),
  });

  const addMilestone = useMutation({
    mutationFn: (data) => apiFetch(
      `/api/projects/${projectId}/workplan/activities/${activity.id}/milestones/`,
      { method: "POST", body: JSON.stringify(data) }
    ),
    onSuccess: () => { refetchMilestones(); setModal(null); setToast({ type: "success", message: "Milestone added." }); },
    onError: (e) => setToast({ type: "error", message: e?.detail || "Failed." }),
  });

  const addDelay = useMutation({
    mutationFn: (data) => apiFetch(
      `/api/projects/${projectId}/workplan/activities/${activity.id}/delays/`,
      { method: "POST", body: JSON.stringify(data) }
    ),
    onSuccess: () => { refetchDelays(); onRefresh(); setModal(null); setToast({ type: "success", message: "Delay recorded." }); },
    onError: (e) => setToast({ type: "error", message: e?.detail || "Failed." }),
  });

  return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 480, background: "var(--paper)", borderLeft: "1px solid var(--rule)", boxShadow: "-4px 0 24px rgba(0,0,0,.08)", display: "flex", flexDirection: "column", zIndex: 200 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", letterSpacing: "0.05em" }}>{activity.code}</span>
              {activity.is_overdue && <OverduePill />}
              {activity.is_critical_path && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--sec-women-pale)", color: "var(--violet)", border: "1px solid var(--violet-soft)", borderRadius: 10, padding: "1px 6px" }}>CRITICAL PATH</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>{activity.name}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--subtle)", padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ marginTop: 10 }}><ProgressBar value={activity.progress} status={activity.status} /></div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--rule)", background: "var(--surface)" }}>
        {[
          { key: "info",       label: "Details",                           icon: "info"        },
          { key: "milestones", label: `Milestones (${milestones.length})`, icon: "check"  },
          { key: "delays",     label: `Delays (${delays.length})`,         icon: "alert-triangle" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)} style={{
            padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            color: activeSection === t.key ? "var(--lime)" : "var(--muted)",
            borderBottom: activeSection === t.key ? "2px solid var(--lime)" : "2px solid transparent",
          }}>
            <Icon name={t.icon} size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {activeSection === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Quick Update</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 12 }}>
                <div style={fieldStyle}>
                  <label style={{ ...labelStyle, fontSize: 11 }}>Status</label>
                  <Select required value={activity.status}
                    onChange={v => updateProgress.mutate({ status: v, progress: activity.progress })}
                    options={ACTIVITY_STATUSES} />
                </div>
                <div style={fieldStyle}>
                  <label style={{ ...labelStyle, fontSize: 11 }}>Progress %</label>
                  <input style={inputStyle} type="number" min={0} max={100} defaultValue={activity.progress}
                    onBlur={e => updateProgress.mutate({ status: activity.status, progress: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Responsible",    value: activity.responsible_user_detail?.full_name || activity.responsible_party || "—" },
                { label: "Planned Dates",  value: `${activity.planned_start} → ${activity.planned_end}` },
                { label: "Baseline End",   value: activity.baseline_end ? `→ ${activity.baseline_end}` : "—" },
                { label: "Revised End",    value: activity.revised_end || "—" },
                { label: "Planned Budget", value: activity.budget_planned ? `${Number(activity.budget_planned).toLocaleString()} USD` : "—" },
                { label: "Spent",          value: activity.budget_spent  ? `${Number(activity.budget_spent).toLocaleString()} USD`  : "—" },
              ].map(item => (
                <div key={item.label} style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {activity.output_node_detail && (
              <div style={{ background: "var(--lime-pale)", border: "1px solid var(--lime-soft)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--lime)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Linked Theory of Change output</div>
                <div style={{ fontSize: 13, color: "var(--lime-darker)", fontWeight: 500 }}>{activity.output_node_detail.code} · {stripHtml(activity.output_node_detail.statement)?.substring(0, 80)}</div>
              </div>
            )}

            {activity.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>{activity.description}</div>
              </div>
            )}
          </div>
        )}

        {activeSection === "milestones" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => setModal({ title: "Add Milestone" })}>
              <Icon name="check" size={14} /> Add Milestone
            </button>
            {milestones.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--subtle)", fontSize: 13 }}>No milestones defined for this activity.</div>
            )}
            {milestones.map(m => {
              const mc = MILESTONE_STATUS_COLORS[m.status] || MILESTONE_STATUS_COLORS.pending;
              return (
                <div key={m.id} style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "12px 14px", background: m.is_gate ? "var(--surface)" : "var(--paper)", borderLeft: m.is_gate ? "3px solid var(--violet)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 2 }}>
                        {m.category} · {m.planned_date}
                        {m.is_gate && <span style={{ marginLeft: 8, color: "var(--violet)", fontWeight: 700 }}>GATE</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: mc.bg, color: mc.text }}>{m.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeSection === "delays" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn btn-warning" onClick={() => setModal({ title: "Record a Delay", isDelay: true })}>
              <Icon name="alert-triangle" size={14} /> Report a Delay
            </button>
            {delays.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--subtle)", fontSize: 13 }}>No delays recorded for this activity.</div>
            )}
            {delays.map(d => (
              <div key={d.id} style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                    {d.delay_category_display}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: d.variance_days > 0 ? "var(--rose)" : "var(--lime)" }}>{d.variance_days > 0 ? "+" : ""}{d.variance_days}d</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: d.approval_status === "approved" ? "var(--lime-pale)" : d.approval_status === "rejected" ? "var(--sec-health-pale)" : "var(--sec-infra-pale)", color: d.approval_status === "approved" ? "var(--lime-darker)" : d.approval_status === "rejected" ? "var(--rose-darker)" : "var(--orange-darker)" }}>
                    {d.approval_status_display}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {d.previous_end} → {d.revised_end}
                  {d.cumulative_variance_days > 0 && <span style={{ marginLeft: 12, color: "var(--rose)", fontWeight: 600 }}>Cumulative: +{d.cumulative_variance_days}d</span>}
                </div>
                {d.justification && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6, fontStyle: "italic" }}>{d.justification}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals inside panel */}
      {modal && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.isDelay
            ? <DelayForm activity={activity} onSave={data => addDelay.mutateAsync(data)} onCancel={() => setModal(null)} />
            : <MilestoneForm activityId={activity.id} onSave={data => addMilestone.mutateAsync(data)} onCancel={() => setModal(null)} />
          }
        </Modal>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ activity, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px 130px 90px 80px", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--surface-2)", cursor: "pointer", background: activity.is_overdue ? "var(--sec-health-pale)" : "var(--paper)", transition: "background .15s" }}
      onMouseEnter={e => e.currentTarget.style.background = activity.is_overdue ? "var(--sec-health-pale)" : "var(--surface)"}
      onMouseLeave={e => e.currentTarget.style.background = activity.is_overdue ? "var(--sec-health-pale)" : "var(--paper)"}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", fontFamily: "monospace" }}>{activity.code}</span>
        {activity.is_critical_path && <span title="Critical path" style={{ color: "var(--violet)", fontSize: 10 }}>◆</span>}
        {activity.is_overdue && <OverduePill />}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity.name}</div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{activity.revised_end || activity.planned_end || "—"}</div>
      <div><StatusBadge status={activity.status} /></div>
      <div><ProgressBar value={activity.progress} status={activity.status} /></div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><Icon name="chevron-right" size={14} style={{ color: "var(--subtle)" }} /></div>
    </div>
  );
}

// ─── Sub-Component Block ──────────────────────────────────────────────────────

function SubComponentBlock({ projectId, sub, outputNodes, users, onActivityClick, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState(null);
  const qc = useQueryClient();

  const addActivity = useMutation({
    mutationFn: (data) => apiFetch(`/api/projects/${projectId}/workplan/activities/`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries(["workplan", projectId]); setModal(false); setToast({ type: "success", message: "Activity created." }); },
    onError: (e) => setToast({ type: "error", message: e?.detail || "Creation failed." }),
  });

  const activities = sub.activities?.filter(a => a.is_active !== false) || [];
  const completedCount = activities.filter(a => a.status === "completed").length;
  const overdueCount = activities.filter(a => a.is_overdue).length;

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "var(--surface-2)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} style={{ color: "var(--subtle)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", fontFamily: "monospace" }}>{sub.code}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", flex: 1 }}>{sub.name}</span>
        <span style={{ fontSize: 11, color: "var(--subtle)" }}>
          {completedCount}/{activities.length} completed
          {overdueCount > 0 && <span style={{ marginLeft: 8, color: "var(--rose)", fontWeight: 700 }}>· {overdueCount} overdue</span>}
        </span>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }}
          onClick={e => { e.stopPropagation(); setModal(true); }}>
          <Icon name="plus" size={12} /> Activity
        </button>
      </div>

      {expanded && (
        <div>
          {activities.length === 0 ? (
            <div style={{ padding: "14px 16px", color: "var(--subtle)", fontSize: 12, fontStyle: "italic" }}>No activities yet — click "+ Activity" to get started.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px 130px 90px 80px", gap: 12, padding: "6px 16px", fontSize: 10, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--rule)", background: "var(--surface)" }}>
                <span>Code</span><span>Name</span><span>End Date</span><span>Status</span><span>Progress</span><span></span>
              </div>
              {activities.map(a => <ActivityRow key={a.id} activity={a} onClick={() => onActivityClick(a)} />)}
            </>
          )}
        </div>
      )}

      {modal && (
        <Modal title="New Activity" onClose={() => setModal(false)}>
          <ActivityForm
            subComponentId={sub.id}
            outputNodes={outputNodes}
            users={users}
            onSave={data => addActivity.mutateAsync(data)}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Component Block ──────────────────────────────────────────────────────────

function ComponentBlock({ projectId, component, outputNodes, users, onActivityClick, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState(null);
  const qc = useQueryClient();

  const addSubComponent = useMutation({
    mutationFn: (data) => apiFetch(`/api/projects/${projectId}/workplan/components/${component.id}/subcomponents/`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries(["workplan", projectId]); setModal(false); setToast({ type: "success", message: "Sub-component created." }); },
    onError: (e) => {
      const d = e?.detail;
      const msg = typeof d === "string" ? d : d ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ") : "Creation failed.";
      setToast({ type: "error", message: msg });
    },
  });

  const subs = component.sub_components?.filter(s => s.is_active !== false) || [];
  const totalActivities = subs.reduce((n, s) => n + (s.activities?.length || 0), 0);
  const completedActivities = subs.reduce((n, s) => n + (s.activities?.filter(a => a.status === "completed").length || 0), 0);
  const overdueActivities = subs.reduce((n, s) => n + (s.activities?.filter(a => a.is_overdue).length || 0), 0);

  return (
    <div style={{ marginBottom: 12, border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--ink)", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} style={{ color: "rgba(255,255,255,.6)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", fontFamily: "monospace" }}>{component.code}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--paper)", flex: 1 }}>{component.name}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>
          {completedActivities}/{totalActivities} activities
          {overdueActivities > 0 && <span style={{ marginLeft: 10, color: "var(--rose-soft)", fontWeight: 700 }}>· {overdueActivities} overdue</span>}
        </span>
        <button className="btn" style={{ fontSize: 11, padding: "4px 10px", background: "rgba(255,255,255,.15)", color: "var(--paper)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6 }}
          onClick={e => { e.stopPropagation(); setModal(true); }}>
          <Icon name="plus" size={12} /> Sub-Component
        </button>
      </div>

      {expanded && (
        <div>
          {subs.length === 0 ? (
            <div style={{ padding: "16px", color: "var(--subtle)", fontSize: 13, fontStyle: "italic" }}>No sub-components yet — click "+ Sub-Component" to structure this component.</div>
          ) : subs.map(s => (
            <SubComponentBlock key={s.id} projectId={projectId} sub={s} outputNodes={outputNodes} users={users} onActivityClick={onActivityClick} onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {modal && (
        <Modal title="New Sub-Component" onClose={() => setModal(false)}>
          <SubComponentForm
            componentId={component.id}
            componentName={`${component.code} — ${component.name}`}
            onSave={data => addSubComponent.mutateAsync(data)}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Workplan Main Page ───────────────────────────────────────────────────────

/**
 * The tabs of the client's workplan pack. `src` names where a view's data
 * comes from, so a built view is told apart from a declared gap on the bar
 * itself; `off` marks a view whose source the system does not record.
 */
const TABS = [
  { key: "plan",       label: "Multi-annual plan", src: "QUARTERS" },
  { key: "activities", label: "Activities",        src: "MILESTONES" },
  { key: "structure",  label: "Structure",         src: "EDIT" },
  { key: "gantt",      label: "Gantt",             src: "SF-3" },
  { key: "delays",     label: "Delays",            src: "SF-7" },
  { key: "awpb",       label: "Annual plan · AWPB", src: "NO SOURCE", off: true },
  { key: "risks",      label: "Actions & risks",   src: "NO SOURCE", off: true },
];

export default function Workplan({ projectId, canEdit = true }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [tab, setTab] = useState("plan");
  // Alerts start collapsed: a project can carry hundreds of them, and the
  // panel used to push the whole workplan below the fold.
  const [alertsOpen, setAlertsOpen] = useState(false);

  const { data: components = [], isLoading } = useQuery({
    queryKey: ["workplan", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/`),
    staleTime: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ["workplan-summary", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/summary/`),
    staleTime: 30_000,
  });

  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ["workplan-alerts", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/alerts/?status=active`),
    staleTime: 60_000,
  });

  const { data: outputNodes = [] } = useQuery({
    queryKey: ["workplan-output-nodes", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/output-nodes/`),
    staleTime: 60_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/identity/users/"),
    staleTime: 300_000,
  });

  const addComponent = useMutation({
    mutationFn: (data) => apiFetch(`/api/projects/${projectId}/workplan/components/`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries(["workplan", projectId]); setModal(false); setToast({ type: "success", message: "Component created." }); },
    onError: (e) => { const d = e?.detail; const msg = typeof d === "string" ? d : d ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ") : "Creation failed."; setToast({ type: "error", message: msg }); },
  });

  function handleRefresh() {
    qc.invalidateQueries(["workplan", projectId]);
    qc.invalidateQueries(["workplan-summary", projectId]);
    qc.invalidateQueries(["workplan-delays", projectId]);
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--subtle)" }}>
        <Icon name="clock" size={20} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13 }}>Loading workplan…</div>
      </div>
    );
  }

  const empty = components.length === 0;

  return (
    <div style={{ position: "relative" }}>
      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
          <SummaryCard icon="list"          label="Total"       value={summary.total_activities} />
          <SummaryCard icon="clock"        label="In Progress" value={summary.in_progress}       accent="var(--blue)" />
          <SummaryCard icon="circle-check"  label="Completed"   value={summary.completed}          accent="var(--lime)" />
          <SummaryCard icon="alert-triangle" label="Overdue"    value={summary.overdue_count}      accent={summary.overdue_count > 0 ? "var(--rose)" : "var(--muted)"} />
          <SummaryCard icon="bar-chart-2"   label="Progress"    value={`${summary.overall_progress}%`} accent="var(--lime)" />
          <SummaryCard icon="zap"           label="SPI"         value={summary.latest_spi != null ? summary.latest_spi.toFixed(2) : "—"}
            accent={summary.latest_spi >= 1 ? "var(--lime)" : summary.latest_spi != null ? "var(--rose)" : "var(--muted)"} />
        </div>
      )}

      {/* SF-6 — Alerts panel */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: alertsOpen ? 10 : 0 }}>
            <button type="button"
              onClick={() => setAlertsOpen(o => !o)}
              aria-expanded={alertsOpen}
              style={{
                display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0,
                border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper)",
                padding: "8px 12px", textAlign: "left",
              }}>
              <Icon name="alert-triangle" size={15} style={{ color: "var(--rose)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--rose)" }}>
                {alerts.length} Active Alert{alerts.length > 1 ? "s" : ""}
              </span>
              {/* Collapsed, the breakdown is all the reader gets — make it count. */}
              <span style={{ display: "flex", gap: 10, fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
                {summariseAlerts(alerts).map(level => (
                  <span key={level.key} style={{ color: level.color }}>
                    {level.count} {level.label}
                  </span>
                ))}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--muted)", flexShrink: 0 }}>
                {alertsOpen ? "Hide" : "Show"}
                <Icon name={alertsOpen ? "chevron-up" : "chevron-down"} size={13} />
              </span>
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }}
              onClick={() => apiFetch(`/api/projects/${projectId}/workplan/alerts/run/`, { method: "POST" }).then(() => refetchAlerts())}>
              <Icon name="refresh" size={12} /> Refresh alerts
            </button>
          </div>
          <div hidden={!alertsOpen} style={{ display: alertsOpen ? "flex" : "none", flexDirection: "column", gap: 6 }}>
            {alerts.slice(0, 5).map(alert => {
              const cfg = ALERT_COLORS[alert.alert_type] || ALERT_COLORS.activity_overdue;
              return (
                <div key={alert.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <Icon name={cfg.icon} size={14} style={{ color: cfg.text, marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                      {alert.alert_type_display}
                      {alert.days_overdue > 0 && <span style={{ marginLeft: 8, fontWeight: 400 }}>· +{alert.days_overdue}d</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 }}>{alert.message}</div>
                  </div>
                  <button onClick={() => apiFetch(`/api/projects/${projectId}/workplan/alerts/${alert.id}/acknowledge/`, { method: "PATCH" }).then(() => refetchAlerts())}
                    style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: cfg.text, fontWeight: 600, whiteSpace: "nowrap", padding: "2px 6px" }}>
                    ✓ Ack
                  </button>
                </div>
              );
            })}
            {alerts.length > 5 && (
              <div style={{ fontSize: 12, color: "var(--subtle)", textAlign: "center", padding: "6px 0" }}>
                +{alerts.length - 5} more alert{alerts.length - 5 > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar — the same record, read six ways */}
      <div className="wp-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button"
            className={`wp-tab${tab === t.key ? " on" : ""}${t.off ? " off" : ""}`}
            onClick={() => setTab(t.key)}>
            {t.label} <span className="wp-src">{t.src}</span>
          </button>
        ))}
      </div>

      {empty && tab !== "structure" ? (
        <div className="wp-gap">
          <div className="wp-gap-badge">Empty workplan</div>
          <p>
            This project has no workplan component yet, so there is nothing to read as
            a plan, a milestone chain or a delay log. Start from the Structure tab.
          </p>
        </div>
      ) : (
        <>
          {tab === "plan" && (
            <MultiAnnualPlan components={components} onActivityClick={setSelectedActivity} />
          )}

          {tab === "activities" && (
            <ActivityMilestones components={components} onActivityClick={setSelectedActivity} />
          )}

          {tab === "structure" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Components & Activities</h3>
                  <p style={{ fontSize: 12, color: "var(--subtle)", margin: "4px 0 0" }}>Component → Sub-Component → Activity · Theory of Change links · Milestones & Delay tracking</p>
                </div>
                {canEdit && (
                  <button className="btn btn-primary" onClick={() => setModal(true)}>
                    <Icon name="plus" size={14} /> Add Component
                  </button>
                )}
              </div>

              {empty ? (
                <div style={{ textAlign: "center", padding: "48px 24px", border: "2px dashed var(--rule)", borderRadius: 12, color: "var(--subtle)" }}>
                  <Icon name="layout" size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Empty Workplan</div>
                  <div style={{ fontSize: 13, marginBottom: 16 }}>Start by creating the first component of this project, aligned with the PAD structure.</div>
                  {canEdit && (
                    <button className="btn btn-primary" onClick={() => setModal(true)}>
                      <Icon name="plus" size={14} /> Create First Component
                    </button>
                  )}
                </div>
              ) : (
                components.map(c => (
                  <ComponentBlock key={c.id} projectId={projectId} component={c} outputNodes={outputNodes} users={users}
                    onActivityClick={setSelectedActivity} onRefresh={handleRefresh} />
                ))
              )}
            </>
          )}

          {tab === "gantt" && (
            <div style={{ border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", padding: "16px" }}>
              <GanttChart components={components} onActivityClick={setSelectedActivity} />
            </div>
          )}

          {tab === "delays" && <DelayLogTable projectId={projectId} />}

          {tab === "awpb" && (
            <NotTrackedView
              title="Annual work plan and budget"
              reason="The system holds one multi-annual set of dates per activity and two
                      budget columns on it. An annual plan is a different object: a slice
                      of the workplan for one year, endorsed and revised on its own, with
                      the activity phased across months and its cost split by source."
              missing={[
                "No plan version or plan type — nothing distinguishes a PAD baseline from an AWPB or a restructuring",
                "No monthly or quarterly phasing of an activity within a year",
                "No activity type, physical unit or planned quantity",
                "No budget line: Activity carries budget_planned and budget_spent, and nothing feeds the latter",
                "Financing sources are recorded at project level, never per activity",
              ]}
            />
          )}

          {tab === "risks" && (
            <NotTrackedView
              title="Management actions and risk register"
              reason="Delays are recorded with a reason code, and the alert engine escalates
                      overdue activities, but neither is a risk. There is no register of
                      agreed actions with an owner and a deadline, and no contract log."
              missing={[
                "No action register — an issue, the action agreed on it, its owner, its deadline and its escalation tier have nowhere to live",
                "No risk register — Project.risk_rating is a single static classification",
                "No procurement or contract model, so a contract risk log has no subject",
                "Nothing is snapshotted, so no figure here would have a history to trend",
              ]}
            />
          )}
        </>
      )}

      {/* Add Component modal */}
      {modal && (
        <Modal title="New Component" onClose={() => setModal(false)}>
          <ComponentForm onSave={data => addComponent.mutateAsync(data)} onCancel={() => setModal(false)} />
        </Modal>
      )}

      {/* Activity detail panel */}
      {selectedActivity && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 199 }} onClick={() => setSelectedActivity(null)} />
          <ActivityDetailPanel projectId={projectId} activity={selectedActivity} outputNodes={outputNodes}
            onClose={() => setSelectedActivity(null)} onRefresh={handleRefresh} />
        </>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

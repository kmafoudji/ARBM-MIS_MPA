/**
 * Module 3 — Workplan
 * SF-1: Component → Sub-Component → Activity hierarchy
 * SF-2: Activity → Output (ToC M2) link
 * SF-4: Status & progress tracking
 * SF-5: Milestones
 * SF-7: Delay log
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  not_started: { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0", label: "Not Started" },
  in_progress:  { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", label: "In Progress" },
  on_hold:      { bg: "#fefce8", text: "#ca8a04", border: "#fde68a", label: "On Hold" },
  completed:    { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0", label: "Completed" },
  cancelled:    { bg: "#fef2f2", text: "#dc2626", border: "#fecaca", label: "Cancelled" },
};

const MILESTONE_STATUS_COLORS = {
  pending:    { bg: "#f1f5f9", text: "#64748b" },
  achieved:   { bg: "#f0fdf4", text: "#16a34a" },
  missed:     { bg: "#fef2f2", text: "#dc2626" },
  forecasted: { bg: "#eff6ff", text: "#2563eb" },
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
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: `${value}%`, height: "100%", borderRadius: 3, transition: "width .3s ease",
          background: status === "completed" ? "#16a34a" : status === "on_hold" ? "#ca8a04" : status === "cancelled" ? "#dc2626" : "#2563eb",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", minWidth: 28 }}>{value}%</span>
    </div>
  );
}

function OverduePill() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700,
      background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
    }}>
      <Icon name="alert-circle" size={9} /> OVERDUE
    </span>
  );
}

function SummaryCard({ icon, label, value, accent }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Icon name={icon} size={12} />{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || "#1e293b" }}>{value}</div>
    </div>
  );
}

// ─── Component Form ───────────────────────────────────────────────────────────

const fieldStyle = { display: "flex", flexDirection: "column", gap: 5 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151" };
const inputStyle = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#1e293b", outline: "none", width: "100%", boxSizing: "border-box" };
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
      {err && <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13, color: "#dc2626" }}>{err}</div>}
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
        <label style={labelStyle}>Description <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span></label>
        <textarea style={{ ...textareaStyle, minHeight: 72 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description of this component..." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
        <Icon name="layers" size={13} style={{ color: "#2563eb" }} />
        <span style={{ fontSize: 12, color: "#1e40af" }}>
          <strong>Component:</strong> {componentName || `#${componentId}`}
        </span>
      </div>

      {err && <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13, color: "#dc2626" }}>{err}</div>}

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
        <label style={labelStyle}>Description <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span></label>
        <textarea style={{ ...textareaStyle, minHeight: 72 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description of this sub-component..." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="plus" size={14} /> Create Sub-Component</button>
      </div>
    </div>
  );
}

// ─── Activity Form ────────────────────────────────────────────────────────────

function ActivityForm({ subComponentId, outputNodes, onSave, onCancel }) {
  const [form, setForm] = useState({
    code: "", name: "", description: "", responsible_party: "",
    planned_start: "", planned_end: "", status: "not_started", progress: 0,
    requires_evidence: false, is_critical_path: false,
    output_node: "", budget_planned: "", order: 0,
    sub_component: subComponentId,
  });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setErr(null);
    try {
      await onSave({ ...form, output_node: form.output_node || null, budget_planned: form.budget_planned || 0, progress: Number(form.progress), order: Number(form.order) });
    } catch (e) { setErr(e?.detail || e?.message || "Save failed."); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {err && <div className="alert alert-error" style={{ fontSize: 13 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Code *</label>
          <input className="form-input" value={form.code} onChange={e => set("code", e.target.value)} placeholder="A1.1.1" />
        </div>
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Activity name" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description..." />
      </div>
      <div className="form-group">
        <label className="form-label">Responsible Party</label>
        <input className="form-input" value={form.responsible_party} onChange={e => set("responsible_party", e.target.value)} placeholder="Organization or individual responsible" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Planned Start *</label>
          <input className="form-input" type="date" value={form.planned_start} onChange={e => set("planned_start", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Planned End *</label>
          <input className="form-input" type="date" value={form.planned_end} onChange={e => set("planned_end", e.target.value)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={form.status} onChange={e => set("status", e.target.value)}>
            {ACTIVITY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Progress (%)</label>
          <input className="form-input" type="number" min={0} max={100} value={form.progress} onChange={e => set("progress", e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Linked Output (ToC) — SF-2</label>
        <select className="form-select" value={form.output_node} onChange={e => set("output_node", e.target.value)}>
          <option value="">— No output linked —</option>
          {outputNodes.map(n => (
            <option key={n.id} value={n.id}>{n.code} · {n.statement?.substring(0, 60)}{n.statement?.length > 60 ? "…" : ""}</option>
          ))}
        </select>
        <div className="form-hint">Output nodes from the Theory of Change (RG-2.1)</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Planned Budget (USD)</label>
          <input className="form-input" type="number" min={0} value={form.budget_planned} onChange={e => set("budget_planned", e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Display Order</label>
          <input className="form-input" type="number" min={0} value={form.order} onChange={e => set("order", e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={form.requires_evidence} onChange={e => set("requires_evidence", e.target.checked)} />
          Evidence required before Completed
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_critical_path} onChange={e => set("is_critical_path", e.target.checked)} />
          Critical path
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="save" size={14} /> Save Activity</button>
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
    try { await onSave(form); } catch (e) { setErr(e?.detail || e?.message || "Save failed."); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <div className="alert alert-error" style={{ fontSize: 13 }}>{err}</div>}
      <div className="form-group">
        <label className="form-label">Milestone Name *</label>
        <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Study report submitted" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-select" value={form.category} onChange={e => set("category", e.target.value)}>
            {MILESTONE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Planned Date *</label>
          <input className="form-input" type="date" value={form.planned_date} onChange={e => set("planned_date", e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <select className="form-select" value={form.status} onChange={e => set("status", e.target.value)}>
          <option value="pending">Pending</option>
          <option value="achieved">Achieved</option>
          <option value="missed">Missed</option>
          <option value="forecasted">Forecasted</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Evidence URL</label>
        <input className="form-input" type="url" value={form.evidence_url} onChange={e => set("evidence_url", e.target.value)} placeholder="https://..." />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={form.is_gate} onChange={e => set("is_gate", e.target.checked)} />
        Gate milestone (blocks activity from reaching 100%)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="save" size={14} /> Save Milestone</button>
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
    if (!form.justification.trim()) { setErr("Justification is mandatory (RG-7.2)."); return; }
    try { await onSave(form); } catch (e) { setErr(e?.detail || e?.message || "Save failed."); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <div className="alert alert-error" style={{ fontSize: 13 }}>{err}</div>}
      <div style={{ padding: "10px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
        <strong>Current end date:</strong> {activity.revised_end || activity.planned_end}
        {activity.baseline_end && <span style={{ marginLeft: 12, color: "#b45309" }}>· Baseline: {activity.baseline_end}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Previous End Date</label>
          <input className="form-input" type="date" value={form.previous_end} onChange={e => set("previous_end", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">New End Date *</label>
          <input className="form-input" type="date" value={form.revised_end} onChange={e => set("revised_end", e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Delay Category * (RG-7.2)</label>
        <select className="form-select" value={form.delay_category} onChange={e => set("delay_category", e.target.value)}>
          {DELAY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Justification *</label>
        <textarea className="form-textarea" rows={3} value={form.justification} onChange={e => set("justification", e.target.value)} placeholder="Mandatory narrative description of the delay and its root causes..." />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={form.cascade_applied} onChange={e => set("cascade_applied", e.target.checked)} />
        Apply cascade to successor activities (RG-7.3)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
        <button className="btn btn-ghost" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Icon name="clock" size={14} /> Record Delay</button>
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
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 480, background: "#fff", borderLeft: "1px solid #e2e8f0", boxShadow: "-4px 0 24px rgba(0,0,0,.08)", display: "flex", flexDirection: "column", zIndex: 200 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" }}>{activity.code}</span>
              {activity.is_overdue && <OverduePill />}
              {activity.is_critical_path && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "#fdf4ff", color: "#9333ea", border: "1px solid #e9d5ff", borderRadius: 10, padding: "1px 6px" }}>CRITICAL PATH</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", lineHeight: 1.3 }}>{activity.name}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ marginTop: 10 }}><ProgressBar value={activity.progress} status={activity.status} /></div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        {[
          { key: "info",       label: "Details",                           icon: "info"  },
          { key: "milestones", label: `Milestones (${milestones.length})`, icon: "flag"  },
          { key: "delays",     label: `Delays (${delays.length})`,         icon: "clock" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)} style={{
            padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            color: activeSection === t.key ? "#A4C53F" : "#64748b",
            borderBottom: activeSection === t.key ? "2px solid #A4C53F" : "2px solid transparent",
          }}>
            <Icon name={t.icon} size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {activeSection === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Quick Update</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Status</label>
                  <select className="form-select" defaultValue={activity.status}
                    onChange={e => updateProgress.mutate({ status: e.target.value, progress: activity.progress })}>
                    {ACTIVITY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ width: 80, marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Progress %</label>
                  <input className="form-input" type="number" min={0} max={100} defaultValue={activity.progress}
                    onBlur={e => updateProgress.mutate({ status: activity.status, progress: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Responsible",    value: activity.responsible_party || "—" },
                { label: "Planned Dates",  value: `${activity.planned_start} → ${activity.planned_end}` },
                { label: "Baseline End",   value: activity.baseline_end ? `→ ${activity.baseline_end}` : "—" },
                { label: "Revised End",    value: activity.revised_end || "—" },
                { label: "Planned Budget", value: activity.budget_planned ? `${Number(activity.budget_planned).toLocaleString()} USD` : "—" },
                { label: "Spent",          value: activity.budget_spent  ? `${Number(activity.budget_spent).toLocaleString()} USD`  : "—" },
              ].map(item => (
                <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {activity.output_node_detail && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Linked Output (ToC — SF-2)</div>
                <div style={{ fontSize: 13, color: "#14532d", fontWeight: 500 }}>{activity.output_node_detail.code} · {activity.output_node_detail.statement?.substring(0, 80)}</div>
              </div>
            )}

            {activity.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{activity.description}</div>
              </div>
            )}
          </div>
        )}

        {activeSection === "milestones" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => setModal({ title: "Add Milestone" })}>
              <Icon name="plus" size={14} /> Add Milestone
            </button>
            {milestones.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>No milestones defined for this activity.</div>
            )}
            {milestones.map(m => {
              const mc = MILESTONE_STATUS_COLORS[m.status] || MILESTONE_STATUS_COLORS.pending;
              return (
                <div key={m.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", background: m.is_gate ? "#fdfbff" : "#fff", borderLeft: m.is_gate ? "3px solid #9333ea" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        {m.category} · {m.planned_date}
                        {m.is_gate && <span style={{ marginLeft: 8, color: "#9333ea", fontWeight: 700 }}>GATE</span>}
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
              <Icon name="clock" size={14} /> Report a Delay
            </button>
            {delays.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>No delays recorded for this activity.</div>
            )}
            {delays.map(d => (
              <div key={d.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    {d.delay_category_display}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: d.variance_days > 0 ? "#dc2626" : "#16a34a" }}>{d.variance_days > 0 ? "+" : ""}{d.variance_days}d</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: d.approval_status === "approved" ? "#f0fdf4" : d.approval_status === "rejected" ? "#fef2f2" : "#fefce8", color: d.approval_status === "approved" ? "#16a34a" : d.approval_status === "rejected" ? "#dc2626" : "#ca8a04" }}>
                    {d.approval_status_display}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {d.previous_end} → {d.revised_end}
                  {d.cumulative_variance_days > 0 && <span style={{ marginLeft: 12, color: "#dc2626", fontWeight: 600 }}>Cumulative: +{d.cumulative_variance_days}d</span>}
                </div>
                {d.justification && <div style={{ fontSize: 12, color: "#475569", marginTop: 6, fontStyle: "italic" }}>{d.justification}</div>}
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
    <div onClick={onClick} style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px 130px 90px 80px", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: activity.is_overdue ? "#fff7f7" : "#fff", transition: "background .15s" }}
      onMouseEnter={e => e.currentTarget.style.background = activity.is_overdue ? "#fef2f2" : "#f8fafc"}
      onMouseLeave={e => e.currentTarget.style.background = activity.is_overdue ? "#fff7f7" : "#fff"}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace" }}>{activity.code}</span>
        {activity.is_critical_path && <span title="Critical path" style={{ color: "#9333ea", fontSize: 10 }}>◆</span>}
        {activity.is_overdue && <OverduePill />}
      </div>
      <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity.name}</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{activity.revised_end || activity.planned_end || "—"}</div>
      <div><StatusBadge status={activity.status} /></div>
      <div><ProgressBar value={activity.progress} status={activity.status} /></div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><Icon name="chevron-right" size={14} style={{ color: "#94a3b8" }} /></div>
    </div>
  );
}

// ─── Sub-Component Block ──────────────────────────────────────────────────────

function SubComponentBlock({ projectId, sub, outputNodes, onActivityClick, onRefresh }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "#f1f5f9", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} style={{ color: "#94a3b8" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", fontFamily: "monospace" }}>{sub.code}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{sub.name}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {completedCount}/{activities.length} completed
          {overdueCount > 0 && <span style={{ marginLeft: 8, color: "#dc2626", fontWeight: 700 }}>· {overdueCount} overdue</span>}
        </span>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }}
          onClick={e => { e.stopPropagation(); setModal(true); }}>
          <Icon name="plus" size={12} /> Activity
        </button>
      </div>

      {expanded && (
        <div>
          {activities.length === 0 ? (
            <div style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>No activities yet — click "+ Activity" to get started.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px 130px 90px 80px", gap: 12, padding: "6px 16px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#fafafa" }}>
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

function ComponentBlock({ projectId, component, outputNodes, onActivityClick, onRefresh }) {
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
    <div style={{ marginBottom: 12, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#1B5A8C", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} style={{ color: "rgba(255,255,255,.6)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", fontFamily: "monospace" }}>{component.code}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", flex: 1 }}>{component.name}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>
          {completedActivities}/{totalActivities} activities
          {overdueActivities > 0 && <span style={{ marginLeft: 10, color: "#fca5a5", fontWeight: 700 }}>· {overdueActivities} overdue</span>}
        </span>
        <button className="btn" style={{ fontSize: 11, padding: "4px 10px", background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6 }}
          onClick={e => { e.stopPropagation(); setModal(true); }}>
          <Icon name="plus" size={12} /> Sub-Component
        </button>
      </div>

      {expanded && (
        <div>
          {subs.length === 0 ? (
            <div style={{ padding: "16px", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>No sub-components yet — click "+ Sub-Component" to structure this component.</div>
          ) : subs.map(s => (
            <SubComponentBlock key={s.id} projectId={projectId} sub={s} outputNodes={outputNodes} onActivityClick={onActivityClick} onRefresh={onRefresh} />
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

export default function Workplan({ projectId, canEdit = true }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

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

  const { data: outputNodes = [] } = useQuery({
    queryKey: ["workplan-output-nodes", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/output-nodes/`),
    staleTime: 60_000,
  });

  const addComponent = useMutation({
    mutationFn: (data) => apiFetch(`/api/projects/${projectId}/workplan/components/`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries(["workplan", projectId]); setModal(false); setToast({ type: "success", message: "Component created." }); },
    onError: (e) => { const d = e?.detail; const msg = typeof d === "string" ? d : d ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ") : "Creation failed."; setToast({ type: "error", message: msg }); },
  });

  function handleRefresh() {
    qc.invalidateQueries(["workplan", projectId]);
    qc.invalidateQueries(["workplan-summary", projectId]);
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
        <Icon name="loader" size={20} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13 }}>Loading workplan…</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
          <SummaryCard icon="activity"     label="Total"       value={summary.total_activities} />
          <SummaryCard icon="clock"        label="In Progress" value={summary.in_progress}       accent="#2563eb" />
          <SummaryCard icon="check-circle" label="Completed"   value={summary.completed}          accent="#16a34a" />
          <SummaryCard icon="alert-circle" label="Overdue"     value={summary.overdue_count}      accent={summary.overdue_count > 0 ? "#dc2626" : "#64748b"} />
          <SummaryCard icon="trending-up"  label="Progress"    value={`${summary.overall_progress}%`} accent="#A4C53F" />
          <SummaryCard icon="zap"          label="SPI"         value={summary.latest_spi != null ? summary.latest_spi.toFixed(2) : "—"}
            accent={summary.latest_spi >= 1 ? "#16a34a" : summary.latest_spi != null ? "#dc2626" : "#64748b"} />
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: 0 }}>Workplan — Components & Activities</h3>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>Component → Sub-Component → Activity · ToC links (SF-2) · Milestones & Delay tracking</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Icon name="plus" size={14} /> Add Component
          </button>
        )}
      </div>

      {/* Components */}
      {components.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", border: "2px dashed #e2e8f0", borderRadius: 12, color: "#94a3b8" }}>
          <Icon name="layout" size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Empty Workplan</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Start by creating the first component of this project, aligned with the PAD structure.</div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setModal(true)}>
              <Icon name="plus" size={14} /> Create First Component
            </button>
          )}
        </div>
      ) : (
        components.map(c => (
          <ComponentBlock key={c.id} projectId={projectId} component={c} outputNodes={outputNodes}
            onActivityClick={setSelectedActivity} onRefresh={handleRefresh} />
        ))
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

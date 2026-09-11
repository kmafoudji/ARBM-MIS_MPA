/**
 * ResultsEntry — SF-4/SF-5 Module 2
 * Grille de saisie des valeurs réelles par indicateur et par période.
 * RAG calculé automatiquement côté serveur après chaque saisie.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon.jsx";
import { useDialog, DialogModal } from "./Dialog.jsx";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";
import EvidencePanel from "./EvidencePanel.jsx";
import Modal from "./Modal.jsx";
import DQScoreWidget from "./DQScoreWidget.jsx";

const RAG_CONFIG = {
  green: { color: "var(--lime)", bg: "var(--lime-pale)", border: "var(--lime-soft)", label: "On track",  icon: "circle-check" },
  amber: { color: "var(--orange)", bg: "var(--sec-infra-pale)", border: "var(--orange-soft)", label: "At risk",   icon: "alert-triangle" },
  red:   { color: "var(--rose)", bg: "var(--rose-soft)", border: "var(--rose-soft)", label: "Off track", icon: "circle-x" },
  na:    { color: "var(--subtle)", bg: "var(--surface-2)", border: "var(--rule)", label: "No target", icon: "minus" },
};

function RagBadge({ rag, rate }) {
  const cfg = RAG_CONFIG[rag] || RAG_CONFIG.na;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
    }}>
      <Icon name={cfg.icon} size={11} />
      {cfg.label}{rate ? ` · ${rate}%` : ""}
    </span>
  );
}

function DisaggregationPanel({ projectId, rd, onClose }) {
  const qc = useQueryClient();
  const [localValues, setLocalValues] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ["disaggregation", projectId, rd.id],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/results/${rd.id}/disaggregation/`),
  });

  const mutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/projects/${projectId}/results/${rd.id}/disaggregation/`, {
      method: "POST", body: JSON.stringify(payload),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disaggregation", projectId, rd.id] }),
  });

  if (isLoading) return <div style={{ padding: 12 }}><span className="spinner" /></div>;

  if (!data?.dimensions?.length) return (
    <div style={{ padding: 12, fontSize: 12, color: "var(--subtle)" }}>
      No disaggregation dimensions configured for this indicator.
      Add dimensions in the Indicator Catalogue.
    </div>
  );

  function getVal(dimId, cat) {
    const key = `${dimId}:${cat}`;
    let raw;
    if (localValues[key] !== undefined) {
      raw = localValues[key];
    } else {
      const existing = data.values?.find(v => v.dimension === dimId && v.category === cat);
      raw = existing ? String(existing.value) : "";
    }
    if (raw === "" || raw === null || raw === undefined) return "";
    const n = parseFloat(raw);
    if (isNaN(n)) return raw;
    // Convertir en notation fixe sans zéros inutiles
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(10)));
  }

  function setVal(dimId, cat, val) {
    setLocalValues(prev => ({ ...prev, [`${dimId}:${cat}`]: val }));
  }

  function saveAll() {
    data.dimensions.forEach(dim => {
      const values = dim.categories.map(cat => ({
        category: cat,
        value: parseFloat(getVal(dim.id, cat) || 0),
      }));
      mutation.mutate({ dimension_id: dim.id, values });
    });
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 10, padding: 16, marginTop: 8 }}>

      {/* Titre */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink-soft)" }}>
          Disaggregation — Total: <strong>{fmtNum(rd.actual_value)}</strong>
        </span>
      </div>

      {/* Avertissements */}
      {data.warnings?.map((w, i) => (
        <div key={i} style={{ background: "var(--sec-infra-pale)", border: "1px solid var(--orange-soft)", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 10, color: "var(--orange)" }}>
          ⚠️ {w.message}
        </div>
      ))}

      {/* Champs par dimension */}
      {data.dimensions.map(dim => {
        const dimSum = dim.categories.reduce((s, cat) => s + parseFloat(getVal(dim.id, cat) || 0), 0);
        const total  = parseFloat(rd.actual_value);
        const sumOk  = Math.abs(dimSum - total) < 0.001;
        return (
          <div key={dim.id} style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
              {dim.name}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              {dim.categories.map(cat => (
                <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{cat}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="field-input"
                    style={{ padding: "5px 10px", fontSize: 13, width: 100 }}
                    value={getVal(dim.id, cat)}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) setVal(dim.id, cat, v);
                    }}
                    placeholder="0"
                  />
                </div>
              ))}
              {/* Somme inline à droite des champs */}
              <div style={{ paddingBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: sumOk ? "var(--lime)" : "var(--orange)" }}>
                  Σ = {fmtNum(dimSum)} {sumOk ? "✓" : `≠ ${fmtNum(total)}`}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Boutons en bas */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <button className="btn btn-ghost btn-sm row" style={{ gap: 6, fontSize: 12 }} onClick={onClose}>
          <Icon name="x" size={12} /> Close
        </button>
        <button
          className="btn btn-primary btn-sm row" style={{ gap: 6, fontSize: 12 }}
          onClick={saveAll} disabled={mutation.isPending}
        >
          <Icon name="check" size={12} /> {mutation.isPending ? "Saving…" : "Save disaggregation"}
        </button>
      </div>
    </div>
  );
}

// Workflow status tag shown in the cell and in the popover header.
const STATUS_STYLE = {
  draft:     { bg: "var(--surface-2)",       color: "var(--subtle)" },
  submitted: { bg: "var(--violet-soft)",     color: "var(--violet)" },
  reviewed:  { bg: "var(--sec-infra-pale)",  color: "var(--orange)" },
  rejected:  { bg: "var(--rose-soft)",       color: "var(--rose)" },
};

function StatusTag({ status }) {
  if (!status) return null;
  if (status === "approved") {
    return <Icon name="lock" size={11} style={{ color: "var(--subtle)" }} title="Approved" />;
  }
  const st = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return <span className="rf-status" style={{ background: st.bg, color: st.color }}>{status}</span>;
}

function errorText(err, fallback) {
  const detail = err?.detail;
  if (!detail) return fallback;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

function normaliseValue(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  return isNaN(n) ? String(v) : (Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(10))));
}

// Floating layer anchored to a cell. Rendered in document.body so the
// table's horizontal scroll does not clip it; follows the anchor on scroll
// and resize, opens above when there is no room below, and closes on
// Escape or on a pointer press outside it and its anchor.
function CellPopover({ anchorRef, onClose, width = 260, children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    function place() {
      const a = anchorRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!a || !pop) return;
      const margin = 8;
      const height = pop.offsetHeight;
      let left = a.left + a.width / 2 - width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      let top = a.bottom + 6;
      if (top + height > window.innerHeight - margin && a.top - 6 - height > margin) {
        top = a.top - 6 - height;
      }
      setPos({ top, left });
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, width]);

  useEffect(() => {
    function onPointerDown(e) {
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={popRef}
      className="rf-pop"
      role="dialog"
      style={{ width, top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}

function EntryCell({ projectId, rowId, period, unit, existingData, onSaved, onDisaggregate, disaggActive, onOpenDocs }) {
  const isLocked = period.period_status === "upcoming";  // overdue = saisissable, approved = via workflow
  const [open, setOpen]       = useState(false);  // popover shown
  const [editing, setEditing] = useState(false);  // popover shows the entry form
  const anchorRef = useRef(null);
  const dialog = useDialog();
  const qc = useQueryClient();

  const close = useCallback(() => { setOpen(false); setEditing(false); }, []);

  const workflowMutation = useMutation({
    mutationFn: ({ action, notes }) => apiFetch(
      `/api/projects/${projectId}/logframe/${rowId}/results/${existingData?.id}/workflow/`,
      { method: "POST", body: JSON.stringify({ action, notes: notes || "" }) }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      close();
      onSaved?.();
    },
  });
  const [value, setValue] = useState(() => normaliseValue(existingData?.actual_value));
  const [narrative, setNarrative] = useState(existingData?.narrative ?? "");

  const mutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/projects/${projectId}/results/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      close();
      onSaved?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/results/${existingData.id}/`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      close();
      onSaved?.();
    },
  });

  function handleSave() {
    if (value === "" || value === null) return;
    mutation.mutate({
      logframe_row:     rowId,
      reporting_period: period.period_id,
      actual_value:     value,
      narrative,
      approve:          false,
    });
  }

  const data = existingData;
  const hasData = !!data?.actual_value;
  const rag = RAG_CONFIG[data?.rag_status] || RAG_CONFIG.na;

  function openView() {
    setEditing(false);
    setOpen(true);
  }
  function openEdit() {
    setValue(normaliseValue(data?.actual_value));
    setNarrative(data?.narrative || "");
    setEditing(true);
    setOpen(true);
  }

  const popoverView = hasData && (
    <>
      <div className="rf-pop-head">
        <div className="rf-pop-label">{period.period_label} · Reported value</div>
        <div className="rf-pop-value-row">
          <span className="rf-pop-value">{fmtNum(data.actual_value)}</span>
          {unit && <span className="rf-pop-unit">{unit}</span>}
          <span style={{ marginLeft: "auto" }}><StatusTag status={data.status} /></span>
        </div>
      </div>
      {data.rag_status && data.rag_status !== "na" ? (
        <div className="rf-pop-rag"><RagBadge rag={data.rag_status} rate={data.achievement_rate} /></div>
      ) : (
        <div className="rf-pop-warn">
          <Icon name="alert-triangle" size={13} /> No target defined — can't classify on/off track
        </div>
      )}
      <div className="rf-pop-menu">
        {data.status === "draft" && !isLocked && (
          <button type="button" className="rf-pop-item" onClick={openEdit}>
            <Icon name="pencil" size={13} /> Edit
          </button>
        )}
        <button type="button" className="rf-pop-item" onClick={() => { close(); onOpenDocs(); }}>
          <Icon name="folder" size={13} /> Docs
        </button>
        <button
          type="button"
          className="rf-pop-item"
          onClick={() => { close(); onDisaggregate({ id: data.id, actual_value: data.actual_value }); }}
        >
          <Icon name="layers" size={13} /> {disaggActive ? "Close disaggregation" : "Disaggregate"}
        </button>
        {["draft", "submitted", "approved"].includes(data.status) && <div className="rf-pop-sep" />}
        {data.status === "draft" && (
          <button type="button" className="rf-pop-item is-primary"
            onClick={() => workflowMutation.mutate({ action: "submit" })}
            disabled={workflowMutation.isPending}>
            <Icon name="arrow-right" size={13} /> Submit
          </button>
        )}
        {data.status === "submitted" && (
          <>
            <button type="button" className="rf-pop-item is-primary"
              onClick={() => workflowMutation.mutate({ action: "approve" })}
              disabled={workflowMutation.isPending}>
              <Icon name="check" size={13} /> Approve
            </button>
            <button type="button" className="rf-pop-item is-danger"
              onClick={() => workflowMutation.mutate({ action: "reject" })}
              disabled={workflowMutation.isPending}>
              <Icon name="x" size={13} /> Reject
            </button>
          </>
        )}
        {data.status === "approved" && (
          <button type="button" className="rf-pop-item is-warning"
            onClick={() => workflowMutation.mutate({ action: "reopen" })}
            disabled={workflowMutation.isPending}>
            <Icon name="edit" size={13} /> Reopen
          </button>
        )}
      </div>
      {workflowMutation.isError && (
        <div className="rf-pop-error">{errorText(workflowMutation.error, "The action failed.")}</div>
      )}
    </>
  );

  const popoverForm = (
    <>
      <div className="rf-pop-head">
        <div className="rf-pop-label">{period.period_label} · {hasData ? "Edit value" : "New value"}</div>
      </div>
      <div className="rf-pop-form">
        <input
          autoFocus
          className="field-input"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) setValue(v);
          }}
          placeholder={unit ? `Actual value (${unit})` : "Actual value"}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <textarea
          className="field-textarea"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Narrative (optional)"
          rows={2}
        />
        {mutation.isError && (
          <div className="rf-pop-error">{errorText(mutation.error, "Could not save the value.")}</div>
        )}
        <div className="rf-pop-actions">
          {hasData && data.status !== "approved" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--rose)", marginRight: "auto" }}
              title="Delete value"
              onClick={async () => {
                const ok = await dialog.confirm("This value will be permanently deleted.", {
                  title: "Delete value?", confirmLabel: "Delete", danger: true,
                });
                if (ok) deleteMutation.mutate();
              }}
            >
              <Icon name="trash" size={12} />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={hasData ? () => setEditing(false) : close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={mutation.isPending || value === ""}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {/* Inside the popover so the confirm dialog counts as a click within it. */}
      <DialogModal {...dialog.dialogProps} />
    </>
  );

  return (
    <td style={{ padding: "6px 8px", textAlign: "center", minWidth: 120, opacity: isLocked && !hasData ? 0.4 : 1 }}>
      {hasData ? (
        <button
          ref={anchorRef}
          type="button"
          className={`rf-cell-btn${open ? " is-open" : ""}`}
          onClick={() => (open ? close() : openView())}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="rf-rag-dot" style={{ background: rag.color }} title={rag.label} />
          <span className="rf-cell-value">{fmtNum(data.actual_value)}</span>
          <StatusTag status={data.status} />
        </button>
      ) : isLocked ? (
        <span style={{ fontSize: 10, color: "var(--rule)" }}>
          🔒 Not open yet
        </span>
      ) : (
        <button
          ref={anchorRef}
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, color: "var(--subtle)" }}
          onClick={() => (open ? close() : openEdit())}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          + Enter
        </button>
      )}
      {open && (
        <CellPopover anchorRef={anchorRef} onClose={close}>
          {editing ? popoverForm : popoverView}
        </CellPopover>
      )}
    </td>
  );
}

export default function ResultsEntry({ projectId, canEdit }) {
  const [disaggState, setDisaggState] = useState(null); // { rowId, periodId, rd }
  const [docsFor, setDocsFor] = useState(null);         // { rowId, rdId, subtitle }
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["results-summary", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/results/summary/`),
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) return (
    <div className="card-body">
      <span className="spinner" /> Loading results…
    </div>
  );

  if (error) return (
    <div className="card-body">
      <p className="text-muted text-sm" style={{ margin: 0, color: "var(--rose)" }}>
        Error loading results: {JSON.stringify(error?.detail || error?.message || error)}
      </p>
    </div>
  );

  if (!data?.rows?.length) return (
    <div className="card-body">
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        No indicators in the logframe. Add indicators to the Theory of Change first.
      </p>
      <pre style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
        {JSON.stringify({ rows: data?.rows?.length, periods: data?.periods?.length }, null, 2)}
      </pre>
    </div>
  );

  if (!data?.periods?.length) return (
    <div className="card-body">
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        No reporting periods generated. Ensure the project is Effective and the reporting schedule is configured.
      </p>
    </div>
  );

  const periods = data.periods;

  return (
    <>
    <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: 12, fontFamily: "inherit",
      }}>
        <thead>
          <tr style={{ background: "var(--surface)", borderBottom: "2px solid var(--surface-2)" }}>
            <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", minWidth: 220 }}>
              Indicator
            </th>
            <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              Unit
            </th>
            <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              Baseline
            </th>
            {periods.map((p) => (
              <th key={p.id} style={{
                textAlign: "center", padding: "10px 8px",
                fontWeight: 700, fontSize: 11, color: "var(--muted)",
                whiteSpace: "nowrap", minWidth: 120,
                borderLeft: "1px solid var(--surface-2)",
              }}>
                {p.label}
                <div style={{ fontWeight: 400, fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  {p.status === "open"     ? "🟢 Open"
                  : p.status === "overdue" ? "⚠️ Overdue"
                  : p.status === "submitted" ? (p.is_late ? "📤 Submitted (late)" : "📤 Submitted")
                  : p.status === "approved"? (p.is_late ? "✅ Approved (late)" : "✅ Approved")
                  : p.status === "upcoming"? "🔒 Upcoming"
                  : ""}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, idx) => {
            const colCount = 3 + periods.length;
            const rowDisagg = disaggState?.rowId === row.row_id ? disaggState : null;
            return (
              <React.Fragment key={row.row_id}>
                <tr key={row.row_id} style={{
                  borderBottom: rowDisagg ? "none" : "1px solid var(--rule)",
                  background: idx % 2 === 0 ? "var(--paper)" : "var(--surface)",
                }}>
                  <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>
                      <span className="badge" style={{ fontSize: 9, marginRight: 6 }}>
                        {row.indicator_code}
                      </span>
                      {row.indicator_name.length > 60
                        ? row.indicator_name.slice(0, 60) + "…"
                        : row.indicator_name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {row.chain_level?.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td style={{ textAlign: "center", padding: "8px", color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                    {row.indicator_unit}
                  </td>
                  <td style={{ textAlign: "center", padding: "8px", color: "var(--muted)", fontSize: 11 }}>
                    {row.baseline_value
                      ? `${fmtNum(row.baseline_value)} (${row.baseline_year || "—"})`
                      : "—"}
                  </td>
                  {row.periods.map((p) => (
                    <EntryCell
                      key={p.period_id}
                      projectId={projectId}
                      rowId={row.row_id}
                      period={p}
                      unit={row.indicator_unit}
                      existingData={p.data}
                      onSaved={() => qc.invalidateQueries({ queryKey: ["results-summary", projectId] })}
                      disaggActive={disaggState?.rowId === row.row_id && disaggState?.periodId === p.period_id}
                      onOpenDocs={() => setDocsFor({
                        rowId: row.row_id,
                        rdId: p.data.id,
                        subtitle: `${row.indicator_code} · ${p.period_label}`,
                      })}
                      onDisaggregate={(rd) => {
                        if (disaggState?.rowId === row.row_id && disaggState?.periodId === p.period_id) {
                          setDisaggState(null);
                        } else {
                          setDisaggState({ rowId: row.row_id, periodId: p.period_id, rd });
                        }
                      }}
                    />
                  ))}
                </tr>
                {rowDisagg && (
                  <tr key={`${row.row_id}-disagg`} style={{ background: idx % 2 === 0 ? "var(--paper)" : "var(--surface)", borderBottom: "1px solid var(--rule)" }}>
                    <td colSpan={colCount} style={{ padding: "0 14px 16px" }}>
                      <DisaggregationPanel
                        projectId={projectId}
                        rd={rowDisagg.rd}
                        onClose={() => setDisaggState(null)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    {docsFor && (
      <Modal
        title="Evidence & supporting documents"
        subtitle={docsFor.subtitle}
        onClose={() => setDocsFor(null)}
      >
        <EvidencePanel projectId={projectId} rowId={docsFor.rowId} rdId={docsFor.rdId} embedded />
      </Modal>
    )}
    </>
  );
}

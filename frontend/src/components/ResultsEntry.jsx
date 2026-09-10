/**
 * ResultsEntry — SF-4/SF-5 Module 2
 * Grille de saisie des valeurs réelles par indicateur et par période.
 * RAG calculé automatiquement côté serveur après chaque saisie.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon.jsx";
import { useDialog, DialogModal } from "./Dialog.jsx";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";
import EvidencePanel from "./EvidencePanel.jsx";
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

function EntryCell({ projectId, rowId, period, existingData, onSaved, onDisaggregate, disaggActive }) {
  const isLocked = period.period_status === "upcoming";  // overdue = saisissable, approved = via workflow
  const [open, setOpen]           = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const workflowMutation = useMutation({
    mutationFn: ({ action, notes }) => apiFetch(
      `/api/projects/${projectId}/logframe/${rowId}/results/${existingData?.id}/workflow/`,
      { method: "POST", body: JSON.stringify({ action, notes: notes || "" }) }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      onSaved?.();
    },
  });
  const [value, setValue] = useState(() => {
    const v = existingData?.actual_value ?? "";
    if (v === "") return "";
    const n = parseFloat(v);
    return isNaN(n) ? v : (Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(10))));
  });
  const [narrative, setNarrative] = useState(existingData?.narrative ?? "");
  const dialog = useDialog();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload) => apiFetch(`/api/projects/${projectId}/results/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      setOpen(false);
      onSaved?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/results/${existingData.id}/`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results-summary", projectId] });
      onSaved?.();
    },
  });

  function handleSave(approve) {
    if (value === "" || value === null) return;
    mutation.mutate({
      logframe_row:     rowId,
      reporting_period: period.period_id,
      actual_value:     value,
      narrative,
      approve,
    });
  }

  const data = existingData;
  const hasData = !!data?.actual_value;

  if (!open) {
    return (
      <td style={{ padding: "6px 8px", textAlign: "center", minWidth: 120, opacity: isLocked && !hasData ? 0.4 : 1 }}>
        <DialogModal {...dialog.dialogProps} />
        {hasData ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {fmtNum(data.actual_value)}
            </span>
            <RagBadge rag={data.rag_status} rate={data.achievement_rate} />
            {/* Badge statut workflow */}
            {data.status && data.status !== "approved" && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                background: data.status === "submitted" ? "var(--violet-soft)" : data.status === "reviewed" ? "var(--sec-infra-pale)" : data.status === "rejected" ? "var(--rose-soft)" : "var(--surface-2)",
                color: data.status === "submitted" ? "var(--violet)" : data.status === "reviewed" ? "var(--orange)" : data.status === "rejected" ? "var(--rose)" : "var(--subtle)",
              }}>{data.status}</span>
            )}
            {data.status === "approved" && (
              <Icon name="lock" size={11} style={{ color: "var(--subtle)" }} title="Approved" />
            )}
            {/* Boutons workflow selon statut */}
            {data.status === "draft" && !isLocked && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", marginTop: 2 }}
                onClick={() => { setValue(data.actual_value); setNarrative(data.narrative || ""); setOpen(true); }}>
                <Icon name="pencil" size={10} /> Edit
              </button>
            )}
            {data.status === "draft" && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", color: "var(--violet)" }}
                onClick={() => workflowMutation.mutate({ action: "submit" })}
                disabled={workflowMutation.isPending}>
                <Icon name="arrow-right" size={10} /> Submit
              </button>
            )}
            {data.status === "submitted" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", color: "var(--lime)" }}
                  onClick={() => workflowMutation.mutate({ action: "approve" })}
                  disabled={workflowMutation.isPending}>
                  <Icon name="check" size={10} /> Approve
                </button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", color: "var(--rose)" }}
                  onClick={() => workflowMutation.mutate({ action: "reject" })}
                  disabled={workflowMutation.isPending}>
                  <Icon name="x" size={10} /> Reject
                </button>
              </>
            )}
            {data.status === "approved" && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", color: "var(--orange)" }}
                onClick={() => workflowMutation.mutate({ action: "reopen" })}
                disabled={workflowMutation.isPending}>
                <Icon name="edit" size={10} /> Reopen
              </button>
            )}
            {/* Evidence */}
            {data && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "1px 6px", color: showEvidence ? "var(--lime)" : "var(--muted)" }}
                onClick={() => setShowEvidence(s => !s)}>
                <Icon name="folder" size={10} /> Docs
              </button>
            )}
            {data && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 10, padding: "1px 6px", color: disaggActive ? "var(--lime)" : "var(--blue)", fontWeight: disaggActive ? 700 : 400 }}
                onClick={() => onDisaggregate({ id: data.id, actual_value: data.actual_value })}
              >
                <Icon name="layers" size={10} /> {disaggActive ? "▲ Close" : "Disaggregate"}
              </button>
            )}

            {/* EvidencePanel inline */}
            {showEvidence && data && (
              <EvidencePanel
                projectId={projectId}
                rowId={rowId}
                rdId={data.id}
                onClose={() => setShowEvidence(false)}
              />
            )}
          </div>
        ) : isLocked ? (
          <span style={{ fontSize: 10, color: "var(--rule)" }}>
            "🔒 Not open yet"
          </span>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, color: "var(--subtle)" }}
            onClick={() => { setValue(""); setNarrative(""); setOpen(true); }}
          >
            + Enter
          </button>
        )}
      </td>
    );
  }

  return (
    <td style={{ padding: "6px 8px", background: "var(--lime-pale)", minWidth: 180 }}>
      <DialogModal {...dialog.dialogProps} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) setValue(v);
          }}
          placeholder="Actual value"
          style={{
            border: "1px solid var(--lime)", borderRadius: 6,
            padding: "4px 8px", fontSize: 13, width: "100%",
            outline: "none", fontFamily: "inherit",
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(false); if (e.key === "Escape") setOpen(false); }}
        />
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Narrative (optional)"
          rows={2}
          style={{
            border: "1px solid var(--rule)", borderRadius: 6,
            padding: "4px 8px", fontSize: 11, width: "100%",
            fontFamily: "inherit", resize: "none", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {hasData && data.status !== "approved" && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 10, color: "var(--rose)", padding: "2px 6px" }}
              onClick={async () => {
                const ok = await dialog.confirm("This value will be permanently deleted.", {
                  title: "Delete value?", confirmLabel: "Delete", danger: true,
                });
                if (ok) deleteMutation.mutate();
              }}
            >
              <Icon name="trash" size={10} />
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: "2px 6px" }}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: "2px 6px" }}
            onClick={() => handleSave(false)}
            disabled={mutation.isPending || value === ""}
          >
            Save draft
          </button>
          <button
            className="btn btn-primary btn-sm"
            style={{ fontSize: 10, padding: "2px 8px" }}
            onClick={() => handleSave(false)}
            disabled={mutation.isPending || value === ""}
          >
            {mutation.isPending ? "…" : "✓ Save"}
          </button>
        </div>
      </div>
    </td>
  );
}

export default function ResultsEntry({ projectId, canEdit }) {
  const [disaggState, setDisaggState] = useState(null); // { rowId, periodId, rd }

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
                      existingData={p.data}
                      onSaved={() => qc.invalidateQueries({ queryKey: ["results-summary", projectId] })}
                      disaggActive={disaggState?.rowId === row.row_id && disaggState?.periodId === p.period_id}
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
  );
}

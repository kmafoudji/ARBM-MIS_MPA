/**
 * ResultsEntry — SF-4/SF-5 Module 2
 * Grille de saisie des valeurs réelles par indicateur et par période.
 * RAG calculé automatiquement côté serveur après chaque saisie.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon.jsx";
import { useDialog, DialogModal } from "./Dialog.jsx";

const RAG_CONFIG = {
  green: { color: "#16a34a", bg: "#dcfce7", border: "#86efac", label: "On track",  icon: "circle-check" },
  amber: { color: "#d97706", bg: "#fef9c3", border: "#fde047", label: "At risk",   icon: "alert-triangle" },
  red:   { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", label: "Off track", icon: "circle-x" },
  na:    { color: "#9ca3af", bg: "#f3f4f6", border: "#e5e7eb", label: "No target", icon: "minus" },
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

function EntryCell({ projectId, rowId, period, existingData, onSaved }) {
  const isLocked = period.period_status === "upcoming" || period.period_status === "approved";
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState(existingData?.actual_value ?? "");
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
              {Number(data.actual_value).toLocaleString()}
            </span>
            <RagBadge rag={data.rag_status} rate={data.achievement_rate} />
            {data.status === "approved" && (
              <Icon name="lock" size={11} style={{ color: "#9ca3af" }} title="Approved" />
            )}
            {!isLocked && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 10, padding: "1px 6px", marginTop: 2 }}
                onClick={() => { setValue(data.actual_value); setNarrative(data.narrative || ""); setOpen(true); }}
              >
                <Icon name="pencil" size={10} /> Edit
              </button>
            )}
          </div>
        ) : isLocked ? (
          <span style={{ fontSize: 10, color: "#d1d5db" }}>
            {period.period_status === "upcoming" ? "🔒 Not open yet" : "—"}
          </span>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, color: "#9ca3af" }}
            onClick={() => { setValue(""); setNarrative(""); setOpen(true); }}
          >
            + Enter
          </button>
        )}
      </td>
    );
  }

  return (
    <td style={{ padding: "6px 8px", background: "#f0f6dc", minWidth: 180 }}>
      <DialogModal {...dialog.dialogProps} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          autoFocus
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Actual value"
          style={{
            border: "1px solid #A4C53F", borderRadius: 6,
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
            border: "1px solid #e5e7eb", borderRadius: 6,
            padding: "4px 8px", fontSize: 11, width: "100%",
            fontFamily: "inherit", resize: "none", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {hasData && data.status !== "approved" && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 10, color: "#dc2626", padding: "2px 6px" }}
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
            onClick={() => handleSave(true)}
            disabled={mutation.isPending || value === ""}
          >
            {mutation.isPending ? "…" : "✓ Approve"}
          </button>
        </div>
      </div>
    </td>
  );
}

export default function ResultsEntry({ projectId, canEdit }) {
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
      <p className="text-muted text-sm" style={{ margin: 0, color: "#dc2626" }}>
        Error loading results: {JSON.stringify(error?.detail || error?.message || error)}
      </p>
    </div>
  );

  if (!data?.rows?.length) return (
    <div className="card-body">
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        No indicators in the logframe. Add indicators to the Theory of Change first.
      </p>
      <pre style={{ fontSize: 10, color: "#999", marginTop: 8 }}>
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
          <tr style={{ background: "#f7f7f5", borderBottom: "2px solid #e5e5e2" }}>
            <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, color: "#666", whiteSpace: "nowrap", minWidth: 220 }}>
              Indicator
            </th>
            <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700, fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>
              Unit
            </th>
            <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700, fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>
              Baseline
            </th>
            {periods.map((p) => (
              <th key={p.id} style={{
                textAlign: "center", padding: "10px 8px",
                fontWeight: 700, fontSize: 11, color: "#666",
                whiteSpace: "nowrap", minWidth: 120,
                borderLeft: "1px solid #e5e5e2",
              }}>
                {p.label}
                <div style={{ fontWeight: 400, fontSize: 10, color: "#999", marginTop: 2 }}>
                  {p.status === "open"     ? "🟢 Open"
                  : p.status === "overdue" ? "🔴 Overdue"
                  : p.status === "approved"? "✅ Approved"
                  : p.status === "upcoming"? "🔒 Upcoming"
                  : ""}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, idx) => (
            <tr key={row.row_id} style={{
              borderBottom: "1px solid #f0f0ee",
              background: idx % 2 === 0 ? "#fff" : "#fafaf8",
            }}>
              <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#111" }}>
                  <span className="badge" style={{ fontSize: 9, marginRight: 6 }}>
                    {row.indicator_code}
                  </span>
                  {row.indicator_name.length > 60
                    ? row.indicator_name.slice(0, 60) + "…"
                    : row.indicator_name}
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                  {row.chain_level?.replace(/_/g, " ")}
                </div>
              </td>
              <td style={{ textAlign: "center", padding: "8px", color: "#666", fontSize: 11, whiteSpace: "nowrap" }}>
                {row.indicator_unit}
              </td>
              <td style={{ textAlign: "center", padding: "8px", color: "#666", fontSize: 11 }}>
                {row.baseline_value
                  ? `${Number(row.baseline_value).toLocaleString()} (${row.baseline_year || "—"})`
                  : "—"}
              </td>
              {row.periods.map((p) => (
                <EntryCell
                  key={p.period_id}
                  projectId={projectId}
                  rowId={row.row_id}
                  period={p}
                  existingData={p.data}
                  onSaved={() => {}}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

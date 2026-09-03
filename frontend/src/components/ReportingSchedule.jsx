/**
 * SF-5 — Calendrier de reporting
 * Affiche les périodes générées et permet de les générer si absentes.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon.jsx";
import { useDialog, DialogModal } from "./Dialog.jsx";

const STATUS_BADGE = {
  upcoming:  "badge",
  open:      "badge badge-blue",
  submitted: "badge badge-violet",
  approved:  "badge badge-lime",
  overdue:   "badge badge-rose",
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(dueDate, status) {
  if (status === "submitted" || status === "approved") return false;
  return new Date(dueDate) < new Date();
}

export default function ReportingSchedule({ projectId, reportingFrequency, projectEndDate, nextReportingDue, canEdit }) {
  const qc = useQueryClient();

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["reporting-periods", projectId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/reporting-periods/`),
    staleTime: 30_000,
  });

  const dialog = useDialog();
  const [generateError, setGenerateError] = useState(null);
  const generateMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/reporting-periods/generate/`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reporting-periods", projectId] }); setGenerateError(null); },
    onError: (e) => setGenerateError(e?.detail || "Generation failed."),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/reporting-periods/reset/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reporting-periods", projectId] });
      setGenerateError(null);
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ pId, status }) =>
      apiFetch(`/api/projects/${projectId}/reporting-periods/${pId}/`, {
        method: "PATCH", body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting-periods", projectId] }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/reporting-periods/refresh/`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting-periods", projectId] }),
  });

  if (isLoading) return <div className="card-body"><span className="spinner" /> Loading…</div>;

  // Résumé
  const total     = periods.length;
  const approved  = periods.filter((p) => p.status === "approved").length;
  const submitted = periods.filter((p) => p.status === "submitted").length;
  const overdue   = periods.filter((p) => isOverdue(p.due_date, p.status)).length;

  return (
    <div className="card-body">
      <DialogModal {...dialog.dialogProps} />
      {/* Pas de fréquence configurée */}
      {!reportingFrequency && (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Reporting frequency not configured. Set it in the Reporting section above to generate the schedule.
        </p>
      )}

      {/* Prérequis manquants */}
      {reportingFrequency && !projectEndDate && (
        <div className="notice notice-warn" style={{ fontSize: 12, marginBottom: 8 }}>
          <Icon name="alert-circle" size={13} style={{ marginRight: 6, flexShrink: 0 }} />
          <span>
            <strong>Project end date required.</strong> Set the end date in the Lifecycle section to generate the reporting schedule.
          </span>
        </div>
      )}

      {/* Fréquence configurée, end_date présent, pas de périodes */}
      {reportingFrequency && projectEndDate && periods.length === 0 && (
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            No periods generated yet.
          </p>
          {canEdit && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}>
              <Icon name="zap" size={14} />
              {generateMutation.isPending ? "Generating…" : "Generate schedule"}
            </button>
          )}
          {generateError && <span className="field-error" style={{ fontSize: 12 }}>{generateError}</span>}
        </div>
      )}

      {/* Tableau des périodes */}
      {periods.length > 0 && (
        <>
          {/* KPIs */}
          <div className="row" style={{ gap: 16, marginBottom: "var(--s-3)", flexWrap: "wrap" }}>
            {[
              { label: "Total",     val: total,     color: "var(--ink)" },
              { label: "Approved",  val: approved,  color: "var(--lime-dark, var(--lime))" },
              { label: "Submitted", val: submitted, color: "var(--navy, #1B5A8C)" },
              { label: "Overdue",   val: overdue,   color: overdue > 0 ? "#dc2626" : "var(--text-muted)" },
            ].map((k) => (
              <div key={k.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{k.label}</div>
              </div>
            ))}
            {canEdit && (
              <div className="row" style={{ gap: 8, marginLeft: "auto", alignSelf: "center" }}>

                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }}
                  title="Update period statuses based on today's date (upcoming / open / overdue)"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}>
                  <Icon name="zap" size={13} />
                  {refreshMutation.isPending ? "Refreshing…" : "Refresh statuses"}
                </button>

                {projectEndDate && reportingFrequency && nextReportingDue && (
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
                    title="Delete all periods and recalculate from current settings"
                    onClick={async () => { const ok = await dialog.confirm("All existing periods will be deleted and regenerated from current settings.", { title: "Recalculate schedule?", confirmLabel: "Recalculate", danger: false }); if (ok) resetMutation.mutate(null, { onSuccess: () => generateMutation.mutate() }); }}
                    disabled={generateMutation.isPending || resetMutation.isPending}>
                    <Icon name="refresh-cw" size={13} />
                    {resetMutation.isPending || generateMutation.isPending ? "Calculating…" : "Recalculate"}
                  </button>
                )}
              </div>
            )}
          </div>

          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left" }}>Period</th>
                <th style={{ textAlign: "left" }}>Start</th>
                <th style={{ textAlign: "left" }}>End</th>
                <th style={{ textAlign: "left" }}>Due date</th>
                <th style={{ textAlign: "left" }}>Status</th>
                {canEdit && <th style={{ width: 120 }}></th>}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const late = isOverdue(p.due_date, p.status);
                return (
                  <tr key={p.id} style={{ opacity: p.status === "approved" ? 0.7 : 1 }}>
                    <td style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>{p.period_number}</td>
                    <td><strong>{p.label}</strong></td>
                    <td className="text-sm">{fmtDate(p.start_date)}</td>
                    <td className="text-sm">{fmtDate(p.end_date)}</td>
                    <td className="text-sm" style={{ color: late ? "#dc2626" : undefined }}>
                      {fmtDate(p.due_date)}
                      {late && <Icon name="alert-circle" size={12} style={{ marginLeft: 4, color: "#dc2626" }} />}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[late ? "overdue" : p.status] || "badge"}
                        title={p.is_late && p.submitted_at ? `Submitted on ${fmtDate(p.submitted_at)}, after the due date` : undefined}>
                        {late ? "Overdue" : p.is_late ? `${p.status_display} (late)` : p.status_display}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {p.status === "upcoming" || p.status === "open" || p.status === "overdue" ? (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                              onClick={() => patchMutation.mutate({ pId: p.id, status: "submitted" })}>
                              Mark submitted
                            </button>
                          ) : p.status === "submitted" ? (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 10 }}
                              onClick={() => patchMutation.mutate({ pId: p.id, status: "approved" })}>
                              Approve
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * NotificationBell — cloche de notifications topbar
 * SF-6 alertes groupées par catégorie avec panneau slide-in
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon";

const CAT_CONFIG = {
  escalation: { icon: "alert-triangle", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  overdue:    { icon: "clock",          color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  milestone:  { icon: "check-square",   color: "#9333ea", bg: "#fdf4ff", border: "#e9d5ff" },
  pending:    { icon: "clock",          color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
};

const ALERT_TYPE_COLOR = {
  escalation_l3:    "#dc2626",
  escalation_l2:    "#ea580c",
  escalation_l1:    "#ca8a04",
  activity_overdue: "#ea580c",
  milestone_missed: "#dc2626",
  milestone_t0:     "#ca8a04",
  milestone_t7:     "#9333ea",
  milestone_t30:    "#64748b",
  delay_pending:    "#2563eb",
};

export default function NotificationBell({ onNavigateProject }) {
  const [open, setOpen]               = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);
  const panelRef                      = useRef(null);
  const qc                            = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["global-notifications"],
    queryFn:  () => apiFetch("/api/workplan/notifications/"),
    refetchInterval: 60_000, // refresh every 60s
    staleTime: 30_000,
  });

  const total      = data?.total      ?? 0;
  const categories = data?.categories ?? {};

  // Acknowledge one alert
  const ackAlert = useMutation({
    mutationFn: ({ projectId, alertId }) =>
      apiFetch(`/api/projects/${projectId}/workplan/alerts/${alertId}/acknowledge/`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries(["global-notifications"]); refetch(); },
  });

  // Acknowledge all
  const ackAll = useMutation({
    mutationFn: () => apiFetch("/api/workplan/notifications/", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries(["global-notifications"]); refetch(); },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-expand first non-empty category
  useEffect(() => {
    if (!open || !data) return;
    const firstCat = Object.entries(categories).find(([, v]) => v.count > 0);
    if (firstCat) setTimeout(() => setExpandedCat(firstCat[0]), 0);
  }, [open, data]);

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "relative", padding: "6px", border: "none", borderRadius: 8,
          background: open ? "#f1f5f9" : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .15s",
        }}
        title="Notifications"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
          stroke={total > 0 ? "#dc2626" : "#64748b"} strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          {total > 0 && <circle cx={18} cy={5} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1.5} />}
        </svg>
        {total > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: "#dc2626", color: "#fff",
            fontSize: 9, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid #fff",
          }}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div style={{ position: "fixed", inset: 0, zIndex: 299 }} onClick={() => setOpen(false)} />

          {/* Panel */}
          <div style={{
            position: "fixed", top: 52, right: 12, zIndex: 300,
            width: 380, maxHeight: "80vh",
            background: "#fff", borderRadius: 14,
            boxShadow: "0 8px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08)",
            border: "1px solid #e2e8f0",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "14px 16px 12px", borderBottom: "1px solid #f1f5f9",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#fafafa",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="alert-triangle" size={15} style={{ color: total > 0 ? "#dc2626" : "#94a3b8" }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                  Notifications
                </span>
                {total > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                    background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
                  }}>{total} active</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {total > 0 && (
                  <button onClick={() => ackAll.mutate()} style={{
                    fontSize: 11, fontWeight: 600, color: "#64748b", border: "1px solid #e2e8f0",
                    background: "#fff", borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                  }}>
                    Acknowledge all
                  </button>
                )}
                <button onClick={() => refetch()} style={{
                  padding: "3px 6px", border: "1px solid #e2e8f0",
                  background: "#fff", borderRadius: 6, cursor: "pointer",
                }}>
                  <Icon name="refresh" size={11} style={{ color: "#64748b" }} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {total === 0 ? (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>All clear!</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>No active alerts across your portfolio.</div>
                </div>
              ) : (
                Object.entries(categories).map(([catKey, cat]) => {
                  if (cat.count === 0) return null;
                  const cfg      = CAT_CONFIG[catKey] || CAT_CONFIG.overdue;
                  const expanded = expandedCat === catKey;

                  return (
                    <div key={catKey} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {/* Category header */}
                      <button
                        onClick={() => setExpandedCat(expanded ? null : catKey)}
                        style={{
                          width: "100%", padding: "10px 16px",
                          display: "flex", alignItems: "center", gap: 10,
                          border: "none", background: expanded ? cfg.bg : "#fff",
                          cursor: "pointer", transition: "background .15s",
                          borderLeft: `3px solid ${expanded ? cfg.color : "transparent"}`,
                        }}>
                        <Icon name={cfg.icon} size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", flex: 1, textAlign: "left" }}>
                          {cat.label}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>{cat.count}</span>
                        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} style={{ color: "#94a3b8" }} />
                      </button>

                      {/* Alert list */}
                      {expanded && (
                        <div style={{ background: "#fafafa" }}>
                          {cat.alerts.map(alert => {
                            const alertColor = ALERT_TYPE_COLOR[alert.alert_type] || cfg.color;
                            return (
                              <div key={alert.id} style={{
                                padding: "10px 16px 10px 24px",
                                borderTop: "1px solid #f1f5f9",
                                display: "flex", gap: 10, alignItems: "flex-start",
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {/* Project + type badge */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                                      background: "#f1f5f9", color: "#64748b",
                                    }}>
                                      {alert.project_code || `Project #${alert.project}`}
                                    </span>
                                    {alert.days_overdue > 0 && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: alertColor }}>
                                        +{alert.days_overdue}d
                                      </span>
                                    )}
                                  </div>
                                  {/* Message */}
                                  <div style={{
                                    fontSize: 12, color: "#374151", lineHeight: 1.45,
                                    overflow: "hidden", textOverflow: "ellipsis",
                                    display: "-webkit-box", WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}>
                                    {alert.message}
                                  </div>
                                  {/* Time */}
                                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                                    {new Date(alert.created_at).toLocaleDateString("en-GB", {
                                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                    })}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                                  {onNavigateProject && alert.project && (
                                    <button
                                      onClick={() => { onNavigateProject(alert.project); setOpen(false); }}
                                      style={{
                                        fontSize: 10, fontWeight: 600, padding: "2px 8px",
                                        border: `1px solid ${cfg.border}`, borderRadius: 5,
                                        background: cfg.bg, color: cfg.color, cursor: "pointer",
                                        whiteSpace: "nowrap",
                                      }}>
                                      View →
                                    </button>
                                  )}
                                  <button
                                    onClick={() => ackAlert.mutate({ projectId: alert.project, alertId: alert.id })}
                                    style={{
                                      fontSize: 10, fontWeight: 600, padding: "2px 8px",
                                      border: "1px solid #e2e8f0", borderRadius: 5,
                                      background: "#fff", color: "#64748b", cursor: "pointer",
                                    }}>
                                    ✓ Ack
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {cat.count > 10 && (
                            <div style={{ padding: "8px 16px", fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                              +{cat.count - 10} more in this category
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "10px 16px", borderTop: "1px solid #f1f5f9",
              background: "#fafafa", fontSize: 11, color: "#94a3b8", textAlign: "center",
            }}>
              Alerts are refreshed automatically every 60 seconds
            </div>
          </div>
        </>
      )}
    </div>
  );
}

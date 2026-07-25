/**
 * Toast — notification non-bloquante positionnée en bas à droite.
 *
 * Usage :
 *   const [toast, setToast] = useState(null);
 *   setToast({ type: "success", title: "...", message: "..." });
 *   <Toast toast={toast} onClose={() => setToast(null)} />
 *
 * types : "success" | "info" | "warning" | "error"
 * Se ferme automatiquement après `duration` ms (défaut 5000).
 */
import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

const TYPE_CONFIG = {
  success: { icon: "circle-check",   color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  info:    { icon: "info-circle",     color: "#1B5A8C", bg: "#dbeafe", border: "#93c5fd" },
  warning: { icon: "alert-triangle",  color: "#d97706", bg: "#fef9c3", border: "#fde047" },
  error:   { icon: "circle-x",        color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
};

export default function Toast({ toast, onClose, duration = 6000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onClose, duration);
    return () => clearTimeout(timerRef.current);
  }, [toast, duration, onClose]);

  if (!toast) return null;

  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9000,
        minWidth: 320,
        maxWidth: 440,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        animation: "toast-in 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      <Icon name={cfg.icon} size={20} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{ fontWeight: 600, fontSize: 13, color: cfg.color, marginBottom: 3 }}>
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.55 }}>
            {toast.message}
          </div>
        )}
        {toast.bullets && (
          <ul style={{ margin: "6px 0 0", padding: "0 0 0 16px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
            {toast.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>

      <button
        onClick={onClose}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 2, color: "#9ca3af", flexShrink: 0, lineHeight: 1,
        }}
        title="Dismiss"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

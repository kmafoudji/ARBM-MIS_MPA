/**
 * Dialog — modal de confirmation/prompt/alerte aux couleurs ARBM-MES.
 *
 * Usage via le hook useDialog :
 *
 *   const dialog = useDialog();
 *
 *   // Confirmation simple
 *   const ok = await dialog.confirm("Supprimer ce partenaire ?", {
 *     title: "Retirer le partenaire",
 *     confirmLabel: "Remove",
 *     danger: true,
 *   });
 *   if (ok) doDelete();
 *
 *   // Prompt (saisie texte)
 *   const value = await dialog.prompt("Nouvelle justification :", {
 *     title: "Modifier la justification",
 *     defaultValue: "...",
 *   });
 *   if (value !== null) save(value);
 *
 *   // Alerte informative
 *   await dialog.alert("Opération réussie.", { title: "Succès" });
 *
 *   // Dans le JSX du composant parent :
 *   <dialog.Dialog />
 */
import { useState, useCallback, useRef } from "react";
import Icon from "./Icon.jsx";

/* ── Composant bas niveau ─────────────────────────────────────────────────── */

function DialogModal({ open, type, title, message, confirmLabel, cancelLabel,
  danger, defaultValue, onConfirm, onCancel }) {
  const [inputValue, setInputValue] = useState(defaultValue || "");

  if (!open) return null;

  const accentColor  = danger ? "#dc2626" : "#A4C53F";
  const accentBg     = danger ? "#fee2e2" : "#f0f6dc";
  const accentDark   = danger ? "#991b1b" : "#7a9420";

  const iconName = danger
    ? "alert-triangle"
    : type === "prompt"
      ? "edit"
      : type === "alert"
        ? "info-circle"
        : "help-circle";

  function handleConfirm() {
    onConfirm(type === "prompt" ? inputValue : true);
  }

  function handleKey(e) {
    if (e.key === "Enter" && type !== "prompt") handleConfirm();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      onKeyDown={handleKey}
      tabIndex={-1}
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(17,17,17,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "dialog-bg-in 0.15s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <style>{`
        @keyframes dialog-bg-in {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes dialog-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>

      <div style={{
        background: "#fff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        animation: "dialog-in 0.2s cubic-bezier(0.16,1,0.3,1)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "18px 20px 14px",
          borderBottom: "1px solid #f0f0ee",
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10,
            background: accentBg,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon name={iconName} size={18} style={{ color: accentColor }} />
          </span>
          <div style={{ flex: 1 }}>
            {title && (
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111", letterSpacing: "-0.01em" }}>
                {title}
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          {message && (
            <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, margin: "0 0 12px" }}>
              {message}
            </p>
          )}
          {type === "prompt" && (
            <textarea
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1px solid #e5e7eb", borderRadius: 8,
                padding: "8px 12px", fontSize: 13,
                fontFamily: "inherit", resize: "vertical",
                minHeight: 72, outline: "none",
                transition: "border-color 0.15s",
              }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={(e) => e.target.style.borderColor = accentColor}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 20px 18px",
          borderTop: "1px solid #f0f0ee",
        }}>
          {type !== "alert" && (
            <button
              onClick={onCancel}
              style={{
                background: "white", border: "1px solid #e5e7eb",
                borderRadius: 8, padding: "8px 16px",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                color: "#374151", fontFamily: "inherit",
              }}
            >
              {cancelLabel || "Cancel"}
            </button>
          )}
          <button
            autoFocus={type !== "prompt"}
            onClick={handleConfirm}
            style={{
              background: danger ? "#dc2626" : "#A4C53F",
              border: "none", borderRadius: 8, padding: "8px 18px",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              color: danger ? "#fff" : "#111", fontFamily: "inherit",
              transition: "filter 0.15s",
            }}
            onMouseEnter={(e) => e.target.style.filter = "brightness(0.9)"}
            onMouseLeave={(e) => e.target.style.filter = "brightness(1)"}
          >
            {confirmLabel || (type === "alert" ? "OK" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useDialog() {
  const [state, setState] = useState({ open: false });
  const resolveRef = useRef(null);

  const open = useCallback((type, message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, type, message, ...opts });
    });
  }, []);

  const handleConfirm = useCallback((value) => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(value);
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(null);
  }, []);

  const confirm = useCallback((message, opts = {}) =>
    open("confirm", message, opts), [open]);

  const prompt = useCallback((message, opts = {}) =>
    open("prompt", message, { defaultValue: "", ...opts }), [open]);

  const alert = useCallback((message, opts = {}) =>
    open("alert", message, { confirmLabel: "OK", ...opts }), [open]);

  const Dialog = useCallback(() => (
    <DialogModal
      open={state.open}
      type={state.type}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      defaultValue={state.defaultValue}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ), [state, handleConfirm, handleCancel]);

  return { confirm, prompt, alert, Dialog };
}

export default DialogModal;

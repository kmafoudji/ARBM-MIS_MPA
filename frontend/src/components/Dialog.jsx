/**
 * Dialog — modal de confirmation/prompt/alerte aux couleurs ARBM-MES.
 *
 * Usage :
 *   const { confirm, prompt, alert, dialogProps } = useDialog();
 *   // Dans le JSX :
 *   <DialogModal {...dialogProps} />
 *
 *   const ok = await confirm("Supprimer ?", { title: "Supprimer", danger: true });
 *   const val = await prompt("Justification :", { defaultValue: "..." });
 *   await alert("Succès !");
 */
import { useState, useCallback, useRef } from "react";
import Icon from "./Icon.jsx";

const TYPE_CONFIG = {
  success: { icon: "circle-check",  color: "var(--lime-darker)", bg: "var(--lime-pale)", border: "var(--lime-soft)" },
  info:    { icon: "info-circle",   color: "var(--blue)", bg: "var(--sec-climate-pale)", border: "var(--blue-soft)" },
  warning: { icon: "alert-triangle",color: "var(--orange)", bg: "var(--sec-infra-pale)", border: "var(--orange-soft)" },
  error:   { icon: "circle-x",      color: "var(--rose)", bg: "var(--sec-health-pale)", border: "var(--rose-soft)" },
};

/* ── Composant de rendu ───────────────────────────────────────────────────── */
export function DialogModal({
  open, type, title, message, confirmLabel, cancelLabel,
  danger, inputValue, onInputChange, onConfirm, onCancel,
}) {
  if (!open) return null;

  const cfg = TYPE_CONFIG[danger ? "error" : type] || TYPE_CONFIG.info;
  const iconName = danger
    ? "alert-triangle"
    : type === "prompt" ? "edit"
    : type === "alert"  ? "info-circle"
    : "help-circle";

  return (
    <div
      tabIndex={-1}
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(17,17,17,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "dialog-bg-in 0.15s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && type !== "prompt") onConfirm();
      }}
    >
      <style>{`
        @keyframes dialog-bg-in { from{opacity:0} to{opacity:1} }
        @keyframes dialog-in { from{opacity:0;transform:scale(.95) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}</style>

      <div style={{
        background: "var(--paper)", borderRadius: 16, width: "100%", maxWidth: 440,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        animation: "dialog-in 0.2s cubic-bezier(0.16,1,0.3,1)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"18px 20px 14px", borderBottom:"1px solid var(--rule)" }}>
          <span style={{ width:36, height:36, borderRadius:10, background: danger?"var(--rose-soft)":cfg.bg, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon name={iconName} size={18} style={{ color: danger?"var(--rose)":cfg.color }} />
          </span>
          <div style={{ flex:1 }}>
            {title && <div style={{ fontWeight:700, fontSize:14, color:"var(--ink)", letterSpacing:"-0.01em" }}>{title}</div>}
          </div>
          <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--subtle)", padding:4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:"16px 20px" }}>
          {message && <p style={{ fontSize:13, color:"var(--ink-soft)", lineHeight:1.6, margin:"0 0 12px" }}>{message}</p>}
          {type === "prompt" && (
            <textarea
              autoFocus
              style={{ width:"100%", boxSizing:"border-box", border:"1px solid var(--rule)", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", resize:"vertical", minHeight:72, outline:"none" }}
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, padding:"12px 20px 18px", borderTop:"1px solid var(--rule)" }}>
          {type !== "alert" && (
            <button onClick={onCancel} style={{ background:"white", border:"1px solid var(--rule)", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:500, cursor:"pointer", color:"var(--ink-soft)", fontFamily:"inherit" }}>
              {cancelLabel || "Cancel"}
            </button>
          )}
          <button
            autoFocus={type !== "prompt"}
            onClick={onConfirm}
            style={{ background: danger?"var(--rose)":"var(--lime)", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:"pointer", color: danger?"var(--paper)":"var(--ink)", fontFamily:"inherit" }}
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
  const [inputValue, setInputValue] = useState("");

  const openDialog = useCallback((type, message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setInputValue(opts.defaultValue || "");
      setState({ open: true, type, message, ...opts });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(state.type === "prompt" ? inputValue : true);
  }, [state.type, inputValue]);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(null);
  }, []);

  const confirm = useCallback((message, opts = {}) => openDialog("confirm", message, opts), [openDialog]);
  const prompt  = useCallback((message, opts = {}) => openDialog("prompt",  message, { defaultValue: "", ...opts }), [openDialog]);
  const alert   = useCallback((message, opts = {}) => openDialog("alert",   message, { confirmLabel: "OK", ...opts }), [openDialog]);

  const dialogProps = {
    open:         state.open,
    type:         state.type,
    title:        state.title,
    message:      state.message,
    confirmLabel: state.confirmLabel,
    cancelLabel:  state.cancelLabel,
    danger:       state.danger,
    inputValue,
    onInputChange: setInputValue,
    onConfirm:    handleConfirm,
    onCancel:     handleCancel,
  };

  return { confirm, prompt, alert, dialogProps };
}

export default DialogModal;

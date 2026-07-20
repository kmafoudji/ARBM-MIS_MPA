import { useState } from "react";

/**
 * Champ tags -> puces, sur le modele d'un champ destinataire e-mail :
 * on tape, Entree ou virgule transforme en puce, backspace sur champ vide
 * retire la derniere puce. Stocke/lit une chaine separee par des virgules
 * (gender_climate_tag reste un CharField cote backend, pas de migration).
 */
export default function TagInput({ value, onChange, placeholder }) {
  const tags = (value || "").split(",").map((t) => t.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const t = draft.trim();
    if (t && !tags.includes(t)) {
      onChange([...tags, t].join(","));
    }
    setDraft("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1).join(","));
    }
  }

  function removeTag(idx) {
    onChange(tags.filter((_, i) => i !== idx).join(","));
  }

  return (
    <div>
      <div
        className="field-input"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 20 }}
      >
        {tags.map((t, i) => (
          <span
            key={i}
            className="badge"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(i)}
              aria-label={`Retirer ${t}`}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
                color: "inherit",
                fontSize: 14,
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={tags.length === 0 ? placeholder : ""}
          style={{ border: "none", outline: "none", flex: 1, minWidth: 100, background: "transparent" }}
        />
      </div>
      <span className="field-help">Separate each tag with a comma or the Enter key.</span>
    </div>
  );
}

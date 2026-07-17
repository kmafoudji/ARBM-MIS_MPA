import { useRef, useState } from "react";
import { IconUpload } from "./ActionIcons.jsx";

/**
 * Champ logo : televersement de fichier, ou saisie directe d'un chemin/URL.
 *
 * Le champ reste textuel en base (`logo_url`) : il accepte indifferemment un
 * asset livre avec l'application (/logos/donors/isdb.png), un fichier
 * televerse (/media/logos/...), ou une URL externe. Le televersement se
 * contente de remplir ce champ.
 */
export default function LogoField({ value, onChange, fallback, color }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);

      // FormData impose son propre Content-Type (avec la frontiere multipart) :
      // on ne le fixe pas a la main, sinon la requete est illisible cote serveur.
      const res = await fetch("/api/uploads/logo/", {
        method: "POST",
        body,
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Le televersement a echoue.");
      onChange(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="logo-field">
        <div className="logo-preview">
          {value ? (
            <img src={value} alt="" onError={(e) => (e.target.style.display = "none")} />
          ) : (
            <span className="logo-preview-mono" style={{ background: color || "var(--ink-soft)" }}>
              {fallback || "—"}
            </span>
          )}
        </div>

        <div className="logo-field-body">
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm btn-icon"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <IconUpload size={13} />
              {busy ? "Envoi..." : "Televerser"}
            </button>
            {value && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>
                Retirer
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={(e) => upload(e.target.files?.[0])}
          />

          <input
            className="field-input text-mono"
            style={{ fontSize: 11 }}
            value={value || ""}
            placeholder="/logos/donors/isdb.png ou https://..."
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="field-error">{error}</div>}
    </>
  );
}

function getCsrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrftoken="))
      ?.split("=")[1] || ""
  );
}

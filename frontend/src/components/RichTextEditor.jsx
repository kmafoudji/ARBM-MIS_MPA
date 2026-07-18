import { useEffect, useRef } from "react";
import Icon from "./Icon";

/**
 * Editeur minimal : contentEditable + document.execCommand plutot qu'une
 * librairie (TipTap, Quill...). execCommand est marque "deprecated" dans
 * la specification HTML mais les 5 commandes utilisees ici (gras,
 * italique, souligne, centrer, liste a puces) restent implementees et
 * stables sur tous les navigateurs majeurs — pas de remplacement standard
 * n'ayant d'ailleurs ete adopte a ce jour. Choix assume pour eviter une
 * dependance lourde sur un besoin volontairement limite a 5 commandes.
 *
 * Stocke du HTML. Le rendu en lecture DOIT passer par sanitizeHtml()
 * (DOMPurify) — voir RichText ci-dessous — sinon toute la plateforme est
 * exposee a une injection XSS stockee des qu'un utilisateur y colle du
 * contenu malveillant.
 */
const COMMANDS = [
  { cmd: "bold", icon: "bold", label: "Gras" },
  { cmd: "italic", icon: "italic", label: "Italique" },
  { cmd: "underline", icon: "underline", label: "Souligne" },
  { cmd: "justifyCenter", icon: "align-center", label: "Centrer" },
  { cmd: "insertUnorderedList", icon: "list", label: "Liste a puces" },
];

export default function RichTextEditor({ value, onChange, placeholder }) {
  const ref = useRef(null);

  // Synchronise uniquement au montage : ce composant est toujours utilise
  // dans un formulaire monte/demonte a l'ouverture (jamais garde en vie
  // avec une valeur qui change sous lui), donc pas besoin de reconcilier
  // sur chaque re-render — ce qui casserait la position du curseur.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd) {
    document.execCommand(cmd, false, null);
    ref.current?.focus();
    onChange(ref.current?.innerHTML || "");
  }

  return (
    <div>
      <div className="row" style={{ gap: 2, marginBottom: 4 }}>
        {COMMANDS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            className="btn btn-ghost btn-sm"
            title={c.label}
            aria-label={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(c.cmd)}
          >
            <Icon name={c.icon} size={14} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="field-textarea richtext-editable"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}

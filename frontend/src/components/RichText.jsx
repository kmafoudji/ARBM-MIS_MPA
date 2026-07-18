import DOMPurify from "dompurify";

/**
 * Rendu en lecture des champs produits par RichTextEditor. Le
 * assainissement ici est la vraie barriere de securite (le stockage
 * accepte n'importe quel HTML) : sans DOMPurify.sanitize(), un contenu
 * colle par un utilisateur pourrait executer du JS dans le navigateur
 * de tout autre utilisateur consultant ce noeud — injection stockee.
 *
 * Assainissement cote backend (defense en profondeur) pas encore fait
 * dans cette passe : a ajouter (ex. bleach) si le besoin se confirme.
 */
function isEmpty(html) {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length === 0;
}

export function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = DOMPurify.sanitize(html);
  return div.textContent || div.innerText || "";
}

export default function RichText({ value }) {
  if (isEmpty(value)) return <span>—</span>;
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }} />;
}

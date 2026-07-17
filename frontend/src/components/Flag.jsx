/**
 * Drapeau de pays rendu en SVG via flag-icons (auto-heberge).
 *
 * Les emojis drapeaux (🇸🇳) ne sont PAS utilises : Chrome sous Linux et
 * Windows ne les rend pas et affiche les lettres du code pays a la place
 * (« SN »), ce qui explique les « AE » / « US » vus a l'ecran.
 */
export default function Flag({ iso2, size = 20, title }) {
  if (!iso2) {
    return (
      <span className="flag-none" title="Institution multilaterale — pas de drapeau national">
        —
      </span>
    );
  }
  return (
    <span
      className={`fi fi-${iso2.toLowerCase()} fis`}
      title={title || iso2}
      role="img"
      aria-label={title || iso2}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "inline-block",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(10,10,10,0.10)",
      }}
    />
  );
}

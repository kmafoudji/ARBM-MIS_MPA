/**
 * Pictogrammes de secteur en SVG.
 *
 * Choix delibere de ne pas utiliser d'emojis (🌾 🏗 ⚕) comme le faisait la
 * demo statique : leur rendu depend des polices du systeme et ils
 * s'affichent en carres vides ou en monochrome selon la machine — ce qui
 * n'est pas acceptable pour une plateforme institutionnelle.
 */
const PATHS = {
  health: <path d="M12 5v14M5 12h14" strokeWidth="2.5" />,
  agriculture: (
    <>
      <path d="M12 20V9" />
      <path d="M12 12c0-2.5-1.5-4-4-4.5C8 10 9.5 11.5 12 12z" />
      <path d="M12 12c0-2.5 1.5-4 4-4.5C16 10 14.5 11.5 12 12z" />
      <path d="M12 8c0-2.5-1-4-2.5-5.5C9.5 5 10.5 6.5 12 8z" />
      <path d="M12 8c0-2.5 1-4 2.5-5.5C14.5 5 13.5 6.5 12 8z" />
    </>
  ),
  infrastructure: (
    <>
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  gender: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </>
  ),
  climate: (
    <>
      <path d="M12 21c0-6 3-11 8-13-1 8-4 12-8 13z" />
      <path d="M12 21c-4-1-7-5-8-13 5 2 8 7 8 13z" />
    </>
  ),
  water: <path d="M12 3c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z" />,
  education: (
    <>
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" />
    </>
  ),
  generic: <path d="M12 3l9 9-9 9-9-9 9-9z" />,
};

export default function SectorIcon({ name, color, size = 32 }) {
  const glyph = PATHS[name] || PATHS.generic;
  const tint = color || "var(--muted)";
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: `color-mix(in srgb, ${tint} 14%, transparent)`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke={tint}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {glyph}
      </svg>
    </span>
  );
}

/**
 * Pictogrammes de secteur en SVG.
 *
 * Choix delibere de ne pas utiliser d'emojis (🌾 🏗 ⚕) comme le faisait la
 * demo statique : leur rendu depend des polices du systeme et ils
 * s'affichent en carres vides ou en monochrome selon la machine — ce qui
 * n'est pas acceptable pour une plateforme institutionnelle.
 */
const PATHS = {
  // --- Sante ---
  health: <path d="M12 5v14M5 12h14" strokeWidth="2.5" />,
  hospital: (
    <>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  maternal: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M9 21v-6a3 3 0 0 1 6 0v6" />
      <circle cx="15.5" cy="14.5" r="2" />
    </>
  ),
  nutrition: (
    <>
      <path d="M12 21c-3.5 0-6-3-6-7 0-3 2-5 4-5 1 0 1.5.5 2 .5s1-.5 2-.5c2 0 4 2 4 5 0 4-2.5 7-6 7z" />
      <path d="M12 9c0-2 1-3.5 3-4" />
    </>
  ),
  vaccine: (
    <>
      <path d="M15 3l6 6M18 6l-9 9-3 6 6-3 9-9z" />
      <path d="M11 9l4 4" />
    </>
  ),

  // --- Agriculture ---
  agriculture: (
    <>
      <path d="M12 20V9" />
      <path d="M12 12c0-2.5-1.5-4-4-4.5C8 10 9.5 11.5 12 12z" />
      <path d="M12 12c0-2.5 1.5-4 4-4.5C16 10 14.5 11.5 12 12z" />
      <path d="M12 8c0-2.5-1-4-2.5-5.5C9.5 5 10.5 6.5 12 8z" />
      <path d="M12 8c0-2.5 1-4 2.5-5.5C14.5 5 13.5 6.5 12 8z" />
    </>
  ),
  livestock: (
    <>
      <path d="M5 10c0-2 1.5-3 3-3h8c1.5 0 3 1 3 3v3c0 3-2 5-4 5h-6c-2 0-4-2-4-5v-3z" />
      <path d="M5 10L3 7M19 10l2-3M9 18v3M15 18v3" />
    </>
  ),
  fishery: (
    <>
      <path d="M3 12c3-4 7-5 10-5s6 2 8 5c-2 3-5 5-8 5s-7-1-10-5z" />
      <circle cx="16" cy="11" r="0.8" fill="currentColor" stroke="none" />
      <path d="M3 12l-1-3M3 12l-1 3" />
    </>
  ),
  irrigation: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20V9a5 5 0 0 1 10 0v11" />
      <path d="M12 4V2M9 6L7.5 4.5M15 6l1.5-1.5" />
    </>
  ),
  forestry: (
    <>
      <path d="M12 3l5 7h-3l3 5H7l3-5H7l5-7z" />
      <path d="M12 15v6" />
    </>
  ),

  // --- Infrastructure ---
  infrastructure: (
    <>
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  water: <path d="M12 3c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z" />,
  sanitation: (
    <>
      <path d="M6 3h12l-1 9a5 5 0 0 1-10 0L6 3z" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  energy: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  transport: (
    <>
      <path d="M3 17h18M5 17V9l3-4h8l3 4v8" />
      <circle cx="8" cy="19" r="1.6" />
      <circle cx="16" cy="19" r="1.6" />
    </>
  ),
  digital: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),

  // --- Transversaux ---
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
  education: (
    <>
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" />
    </>
  ),
  employment: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  governance: (
    <>
      <path d="M12 3l9 5H3l9-5z" />
      <path d="M6 8v8M10 8v8M14 8v8M18 8v8M3 20h18" />
    </>
  ),
  fragility: (
    <>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
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
        style={{ stroke: tint }}
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

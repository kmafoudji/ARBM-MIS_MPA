const base = {
  className: "nav-icon",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  "aria-hidden": true,
};

export const IconDashboard = () => (
  <svg {...base}>
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

export const IconPortfolioOverview = () => (
  <svg {...base}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const IconMasterData = () => (
  <svg {...base}>
    <path d="M4 4h16v4H4zM4 12h16v4H4zM4 20h10" />
  </svg>
);

export const IconProjects = () => (
  <svg {...base}>
    <path d="M3 7h18M3 12h18M3 17h12" />
  </svg>
);

export const IconNewProject = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const IconUsers = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
  </svg>
);

export const IconCatalogue = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
);

/* Logo ARBM-MIS — double losange (variante C) */
export const IconPortfolio = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="10" width="3" height="7" rx="0.5"/>
    <rect x="6" y="6"  width="3" height="11" rx="0.5"/>
    <rect x="11" y="3" width="3" height="14" rx="0.5"/>
    <path d="M2.5 8 L7.5 4.5 L12.5 2" strokeWidth="1.4"/>
    <circle cx="2.5" cy="8"   r="1" fill="currentColor" stroke="none"/>
    <circle cx="7.5" cy="4.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="12.5" cy="2"  r="1" fill="currentColor" stroke="none"/>
  </svg>
);

export const BrandMark = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 38 38" aria-hidden="true">
    <polygon points="19,2 36,19 19,36 2,19" fill="#2B2B2B"/>
    <polygon points="19,7 31,19 19,31 7,19" fill="#0EB584"/>
  </svg>
);

/* Logo complet : logo officiel LLF (blanc sur fond sombre, charcoal sur clair) */
/* `width` donne : le logo remplit la largeur, la hauteur suit (ratio conserve) ;
   sinon la hauteur est fixe et la largeur suit. */
export const LogoFull = ({ dark = false, height = 40, width }) => (
  <img
    src={dark ? "/logos/llf/llf-logo-white.png" : "/logos/llf/llf-logo-charcoal.png"}
    alt="Lives and Livelihoods Fund"
    style={width
      ? { display: "block", width, height: "auto", maxWidth: "100%" }
      : { display: "block", height, width: "auto", maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start", flexShrink: 0 }}
  />
);

export const MicrosoftLogo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="0" y="0" width="7" height="7" fill="#FB563B" />
    <rect x="9" y="0" width="7" height="7" fill="#0EB584" />
    <rect x="0" y="9" width="7" height="7" fill="#0089C5" />
    <rect x="9" y="9" width="7" height="7" fill="#F49D07" />
  </svg>
);

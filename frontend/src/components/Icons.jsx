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

export const BrandMark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="11" width="20" height="2" fill="#0F1A1E" transform="rotate(45 12 12)" />
    <rect x="11" y="2" width="2" height="20" fill="#0F1A1E" transform="rotate(45 12 12)" />
  </svg>
);

export const MicrosoftLogo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="0" y="0" width="7" height="7" fill="#F35325" />
    <rect x="9" y="0" width="7" height="7" fill="#81BC06" />
    <rect x="0" y="9" width="7" height="7" fill="#05A6F0" />
    <rect x="9" y="9" width="7" height="7" fill="#FFBA08" />
  </svg>
);

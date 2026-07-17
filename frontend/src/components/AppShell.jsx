import {
  BrandMark,
  IconDashboard,
  IconMasterData,
  IconNewProject,
  IconProjects,
  IconUsers,
} from "./Icons.jsx";

const NAV_GROUPS = [
  {
    label: "Pilotage",
    items: [{ key: "overview", label: "Tableau de bord", Icon: IconDashboard }],
  },
  {
    label: "Referentiels",
    items: [{ key: "masterdata", label: "Donnees de base", Icon: IconMasterData }],
  },
  {
    label: "Projets & suivi",
    items: [
      { key: "projects", label: "Projets", Icon: IconProjects, badgeKey: "projects" },
      { key: "new-project", label: "Nouveau projet", Icon: IconNewProject },
    ],
  },
  {
    label: "Systeme",
    items: [{ key: "rbac", label: "Utilisateurs & roles", Icon: IconUsers, badgeKey: "users" }],
  },
];

const CRUMB_LABELS = {
  overview: "Tableau de bord",
  masterdata: "Donnees de base",
  projects: "Projets",
  "new-project": "Nouveau projet",
  "project-detail": "Fiche projet",
  rbac: "Utilisateurs & roles",
};

const API_PATHS = {
  overview: "/api/overview",
  masterdata: "/api/reference",
  projects: "/api/projects",
  "new-project": "/api/projects",
  "project-detail": "/api/projects/:id",
  rbac: "/api/identity/roles",
};

// La fiche projet est une sous-vue de Projets : on garde l'entree "Projets"
// active dans la navigation laterale.
const NAV_ALIAS = { "project-detail": "projects" };

function initials(user) {
  const source = user?.name || user?.email || "?";
  const parts = source.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

export default function AppShell({ view, onNavigate, user, counts = {}, children }) {
  const activeKey = NAV_ALIAS[view] || view;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BrandMark />
          </div>
          <div className="brand-text-wrap">
            <div className="brand-name">ARBM-MES</div>
            <div className="brand-sub">Console · LLF2</div>
          </div>
        </div>

        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(({ key, label, Icon, badgeKey }) => (
                <button
                  key={key}
                  className={`nav-item${activeKey === key ? " active" : ""}`}
                  onClick={() => onNavigate(key)}
                  aria-current={activeKey === key ? "page" : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                  {badgeKey && counts[badgeKey] !== undefined && (
                    <span className="nav-badge">{counts[badgeKey]}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials(user)}</div>
            <div className="user-meta">
              <div className="user-name">{user?.name || user?.email}</div>
              <div className="user-role" title={user?.roles?.join(", ")}>
                {user?.roles?.length
                  ? user.roles.join(" · ")
                  : user?.is_superuser
                  ? "Superutilisateur"
                  : "Aucun role attribue"}
              </div>
            </div>
          </div>
          <a className="user-signout" href="/auth/logout/">
            Se deconnecter
          </a>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="crumb">
            <span className="diamond" />
            <span>ARBM-MES</span>
            <span>›</span>
            <span className="crumb-main">{CRUMB_LABELS[view]}</span>
          </div>
          <div className="topbar-actions">
            <span className="api-pill">{API_PATHS[view]}</span>
            <span className="env-tag">POC</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

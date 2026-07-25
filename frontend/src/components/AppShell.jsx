import { useState } from "react";
import {
  BrandMark,
  LogoFull,
  IconCatalogue,
  IconDashboard,
  IconPortfolio,
  IconMasterData,
  IconNewProject,
  IconProjects,
  IconUsers,
} from "./Icons.jsx";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import i18n from "../i18n/index.js";

const NAV_GROUPS = [
  {
    label: "Steering",
    items: [{ key: "overview", label: "Dashboard", Icon: IconDashboard }],
  },
  {
    label: "Reference Data",
    items: [{ key: "masterdata", label: "Reference Data", Icon: IconMasterData }],
  },
  {
    label: "Projects & Monitoring",
    items: [
      { key: "projects", label: "Projects", Icon: IconProjects, badgeKey: "projects" },
      { key: "new-project", label: "New Project", Icon: IconNewProject },
      { key: "indicator-catalogue", label: "Indicator Catalogue", Icon: IconCatalogue },
      { key: "portfolio", label: "Portfolio Results", Icon: IconPortfolio },
    ],
  },
  {
    label: "System",
    items: [{ key: "rbac", label: "Users & Roles", Icon: IconUsers, badgeKey: "users" }],
  },
];

// Chaine du fil d'Ariane : chaque vue declare son parent, ce qui permet de
// reconstruire un chemin cliquable jusqu'au tableau de bord.
const CRUMBS = {
  overview: { label: "Dashboard", parent: null },
  masterdata: { label: "Reference Data", parent: "overview" },
  projects: { label: "Projects", parent: "overview" },
  "new-project": { label: "New Project", parent: "projects" },
  "project-detail": { label: "Project", parent: "projects" },
  "project-toc":      { label: "Theory of Change", parent: "project-detail" },
  "project-logframe": { label: "Logframe", parent: "project-detail" },
  "indicator-catalogue": { label: "Indicator Catalogue", parent: "overview" },
  portfolio: { label: "Portfolio Results", parent: "overview" },
  pirs:      { label: "PIRS", parent: "project-logframe" },
  rbac: { label: "Users & Roles", parent: "overview" },
};

function crumbTrail(view) {
  const trail = [];
  let key = view;
  while (key) {
    trail.unshift({ key, ...CRUMBS[key] });
    key = CRUMBS[key]?.parent;
  }
  return trail;
}

const API_PATHS = {
  overview: "/api/overview",
  masterdata: "/api/reference",
  projects: "/api/projects",
  "new-project": "/api/projects",
  "project-detail": "/api/projects/:id",
  "indicator-catalogue": "/api/results/indicators",
  portfolio: "/api/results/portfolio",
  pirs:      "/api/projects/:id/logframe/:row/pirs",
  rbac: "/api/identity/roles",
};

// La fiche projet est une sous-vue de Projets : on garde l'entree "Projets"
// active dans la navigation laterale.
const NAV_ALIAS = {
  "project-detail":   "projects",
  "project-toc":      "projects",
  "project-logframe": "projects",
  "pirs":             "projects",
};

function initials(user) {
  const source = user?.name || user?.email || "?";
  const parts = source.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

export default function AppShell({ view, onNavigate, user, counts = {}, children }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState(i18n.language || "en");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function closeSidebar() { setSidebarOpen(false); }
  function openSidebar()  { setSidebarOpen(true); }
  const activeKey = NAV_ALIAS[view] || view;

  function switchLang(l) {
    i18n.changeLanguage(l);
    localStorage.setItem("arbm_lang", l);
    setLang(l);
  }

  const NAV_GROUPS_T = [
    {
      label: t("nav.dashboard"),
      items: [{ key: "overview", label: t("nav.dashboard"), Icon: IconDashboard }],
    },
    {
      label: t("masterdata.title"),
      items: [{ key: "masterdata", label: t("masterdata.title"), Icon: IconMasterData }],
    },
    {
      label: t("nav.portfolio"),
      items: [
        { key: "projects", label: t("nav.projects"), Icon: IconProjects, badgeKey: "projects" },
        { key: "new-project", label: t("project.new"), Icon: IconNewProject },
        { key: "indicator-catalogue", label: t("nav.indicator_catalogue"), Icon: IconCatalogue },
        { key: "portfolio", label: "Portfolio Results", Icon: IconPortfolio },
      ],
    },
    {
      label: t("nav.system"),
      items: [{ key: "rbac", label: t("nav.users_roles"), Icon: IconUsers, badgeKey: "users" }],
    },
  ];

  return (
    <div className="app">
      {/* Overlay mobile */}
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={closeSidebar} aria-hidden="true" />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <LogoFull dark={true} />
          <div className="brand-sub-wrap">
            <div className="brand-sub">{t("app.console")}</div>
          </div>
        </div>

        <nav className="nav">
          {NAV_GROUPS_T.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(({ key, label, Icon, badgeKey }) => (
                <button
                  key={key}
                  className={`nav-item${activeKey === key ? " active" : ""}`}
                  onClick={() => { onNavigate(key); closeSidebar(); }}
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
                  ? "Superuser"
                  : "No role assigned"}
              </div>
            </div>
          </div>
          <a className="user-signout" href="/auth/logout/">
            <Icon name="logout" size={14} /> {t("auth.sign_out")}
          </a>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="burger-btn" onClick={openSidebar} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <nav className="crumb" aria-label={t("nav.breadcrumb")}>
            <span className="diamond" />
            {crumbTrail(view).map((c, i, arr) => {
              const isLast = i === arr.length - 1;
              return (
                <span key={c.key} className="row" style={{ gap: "var(--s-2)" }}>
                  {isLast ? (
                    <span className="crumb-main" aria-current="page">{c.label}</span>
                  ) : (
                    <button className="crumb-link" onClick={() => onNavigate(c.key)}>
                      {c.label}
                    </button>
                  )}
                  {!isLast && <span aria-hidden="true">›</span>}
                </span>
              );
            })}
          </nav>
          <div className="topbar-actions">
            {/* Switcher langue EN / FR */}
            <div className="row" style={{ gap: 4 }}>
              {["en", "fr", "ar"].map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  className={`btn btn-sm ${lang === l ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "2px 8px", fontSize: 12, minWidth: 32 }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="api-pill">{API_PATHS[view]}</span>
            <span className="env-tag">POC</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

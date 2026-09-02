import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import NotificationBell from "./NotificationBell";
import { PROJECT_PILLARS, PROJECT_TABS, computeTabLocks } from "../pages/ProjectDetail.jsx";
import { apiFetch } from "../api";

// Views that belong to the PROJECT scope: opening them swaps the whole
// sidebar for the project sidebar (sidebar B) with its context header.
const PROJECT_VIEWS = new Set(["project-detail", "pirs"]);

// Breadcrumb chain: each view declares its parent, so a clickable trail up to
// the dashboard can be rebuilt.
const CRUMBS = {
  overview: { label: "Dashboard", parent: null },
  masterdata: { label: "Reference Data", parent: "overview" },
  projects: { label: "Projects", parent: "overview" },
  "new-project": { label: "New Project", parent: "projects" },
  "project-detail": { label: "Project", parent: "projects" },
  "indicator-catalogue": { label: "Indicator Catalogue", parent: "overview" },
  portfolio: { label: "Portfolio Results", parent: "overview" },
  "dq-portfolio": { label: "Data Quality", parent: "overview" },
  "bulk-import": { label: "Bulk Import", parent: "projects" },
  pirs:      { label: "PIRS", parent: "project-detail" },
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
  "dq-portfolio": "/api/results/dq-portfolio",
  pirs:      "/api/projects/:id/logframe/:row/pirs",
  rbac: "/api/identity/roles",
};

// Portfolio-sidebar active entry for sub-views that have no entry of their own.
const NAV_ALIAS = {
  "project-detail": "projects",
  "pirs":           "projects",
};

function initials(user) {
  const source = user?.name || user?.email || "?";
  const parts = source.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

// ── Hub scope selector ──────────────────────────────────────────────────────
// The hub is a denominator, not a filter: changing it recomputes every figure
// on screen (the backend recomputes inside the session scope), so a change
// invalidates every query. Rendered only in the PORTFOLIO scope, and only
// when the user's scope offers a choice; a single allowed hub renders as a
// fixed label. Users scoped to a project (or nothing) get no control at all.
function HubScopeSelector({ scope }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!scope || !["global", "hubs"].includes(scope.kind)) return null;
  const hubs = scope.allowed_hubs || [];
  if (hubs.length === 0) return null;

  const selected = hubs.find((h) => h.id === scope.selected_hub_id) || null;
  const label = selected ? selected.name : t("nav.all_hubs");

  if (hubs.length === 1 && scope.kind === "hubs") {
    // One hub in scope: an attribute, not a choice.
    return (
      <span className="hubsel-fixed" title={t("nav.hub_fixed_hint")}>
        <Icon name="map-pin" size={12} /> {hubs[0].name}
      </span>
    );
  }

  async function choose(hubId) {
    setOpen(false);
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch("/api/scope/hub/", {
        method: "POST",
        body: JSON.stringify({ hub: hubId }),
      });
      // Denominator changed: every figure on screen must recompute.
      await queryClient.invalidateQueries();
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="hubsel">
      <button
        className="hubsel-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icon name="map-pin" size={12} /> {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="hubsel-drop" role="listbox">
          <div className="hubsel-title">{t("nav.hub_scope")}</div>
          {scope.kind === "global" && (
            <button
              className={`hubsel-opt${!selected ? " on" : ""}`}
              onClick={() => choose(null)}
            >
              {t("nav.all_hubs")}
            </button>
          )}
          {hubs.map((h) => (
            <button
              key={h.id}
              className={`hubsel-opt${selected?.id === h.id ? " on" : ""}`}
              onClick={() => choose(h.id)}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export default function AppShell({
  view,
  onNavigate,
  user,
  counts = {},
  projectId = null,
  projectTab = "overview",
  onProjectTab = () => {},
  returnTo = "projects",
  children,
}) {
  const { t } = useTranslation();
  const [lang, setLang] = useState(i18n.language || "en");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scope = user?.scope; // absent on an older backend: no selector, no gating
  const inProject = PROJECT_VIEWS.has(view) && !!projectId;
  const isProjectOnly = scope?.kind === "project";

  // Both queries hit keys the app already uses — the cache dedupes them.
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/`),
    enabled: inProject,
  });
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects/"),
    enabled: inProject,
  });

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
        { key: "bulk-import", label: t("nav.bulk_import"), Icon: IconNewProject },
        { key: "indicator-catalogue", label: t("nav.indicator_catalogue"), Icon: IconCatalogue },
        { key: "portfolio", label: t("nav.portfolio_results"), Icon: IconPortfolio },
        { key: "dq-portfolio", label: t("nav.data_quality"), Icon: IconCatalogue },
      ],
    },
    {
      label: t("nav.system"),
      items: [{ key: "rbac", label: t("nav.users_roles"), Icon: IconUsers, badgeKey: "users" }],
    },
  ];

  const locks = inProject ? computeTabLocks(project) : {};
  const activeSection = view === "pirs" ? "logframe" : projectTab;
  const leadCountry = project?.countries_detail?.find((c) => c.is_lead);
  const siblings = (projects || []).filter((p) => p.id !== projectId).slice(0, 6);

  // Sidebar B — project scope: context header on top, then the sections.
  const projectSidebar = (
    <>
      <div className="ctx-card">
        {!isProjectOnly && (
          <button
            className="ctx-back"
            onClick={() => { onNavigate(returnTo); closeSidebar(); }}
          >
            ← {t("nav.back_to")} {CRUMBS[returnTo]?.label || CRUMBS.projects.label}
          </button>
        )}
        <div className="ctx-code text-mono">{project?.code || "…"}</div>
        <div className="ctx-name">{project?.name || ""}</div>
        <div className="ctx-meta">
          {leadCountry ? `${leadCountry.flag} ${leadCountry.name}` : ""}
          {project?.hub_name ? ` · ${project.hub_name}` : ""}
        </div>
        {project?.lifecycle_stage_display && (
          <div className="ctx-stage">{project.lifecycle_stage_display}</div>
        )}
        {siblings.length > 0 && (
          <div className="ctx-siblings">
            {siblings.map((p) => (
              <button
                key={p.id}
                title={p.name}
                onClick={() => { onNavigate("project-detail", { projectId: p.id }); closeSidebar(); }}
              >
                {p.code || p.acronym || `#${p.id}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <nav className="nav">
        {PROJECT_PILLARS.map((pillar) => (
          <div key={pillar.key}>
            <div className="nav-label">{pillar.label}</div>
            {PROJECT_TABS.filter((tb) => tb.pillar === pillar.key).map(({ key, label, icon }) => {
              const lock = locks[key] || { locked: false };
              const isActive = activeSection === key;
              return (
                <button
                  key={key}
                  className={`nav-item${isActive ? " active" : ""}${lock.locked ? " locked" : ""}`}
                  onClick={() => {
                    if (lock.locked) return;
                    onProjectTab(key);
                    closeSidebar();
                  }}
                  title={lock.locked ? lock.reason : ""}
                  disabled={lock.locked}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon name={icon} size={14} />
                  <span>{label}</span>
                  {lock.locked && <Icon name="lock" size={11} />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );

  // Sidebar A — portfolio scope: the cross-project navigation.
  const portfolioSidebar = (
    <nav className="nav">
      {NAV_GROUPS_T.map((group) => (
        <div key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.items.map(({ key, label, Icon: ItemIcon, badgeKey }) => (
            <button
              key={key}
              className={`nav-item${activeKey === key ? " active" : ""}`}
              onClick={() => { onNavigate(key); closeSidebar(); }}
              aria-current={activeKey === key ? "page" : undefined}
            >
              <ItemIcon />
              <span>{label}</span>
              {badgeKey && counts[badgeKey] !== undefined && (
                <span className="nav-badge">{counts[badgeKey]}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="app">
      {/* Overlay mobile */}
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={closeSidebar} aria-hidden="true" />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <LogoFull dark={true} width="100%" />
          <div className="brand-sub-wrap">
            <div className="brand-sub"><span className="brand-product">{t("app.title")}</span> · {t("app.console")}</div>
          </div>
        </div>

        {inProject ? projectSidebar : portfolioSidebar}

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
          <span className={`scope-badge${inProject ? " proj" : ""}`}>
            {inProject ? t("nav.scope_project") : t("nav.scope_portfolio")}
          </span>
          {/* The hub selector sits on the identity line, before the section
              name: it is the denominator of everything shown. Inside a
              project it disappears — the hub is in the context header. */}
          {!inProject && <HubScopeSelector scope={scope} />}
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
            {/* Notification bell */}
            <NotificationBell
              onNavigateProject={projectId => onNavigate("project-detail", { projectId })}
            />
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

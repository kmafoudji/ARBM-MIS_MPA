import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "./components/AppShell.jsx";
import SplashScreen from "./components/SplashScreen.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import ProjectList from "./pages/ProjectList.jsx";
import ProjectCreateForm from "./pages/ProjectCreateForm.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import TheoryOfChange from "./pages/TheoryOfChange.jsx";
import Logframe from "./pages/Logframe.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import IndicatorCatalogue from "./pages/IndicatorCatalogue.jsx";
import MasterData from "./pages/MasterData.jsx";
import Rbac from "./pages/Rbac.jsx";
import { apiFetch } from "./api";
import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "#dc2626" }}>
          <strong>Runtime Error:</strong>
          <pre style={{ marginTop: 12, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [authState, setAuthState] = useState("checking");
  const [user, setUser] = useState(null);
  const [nav, setNav] = useState("overview");
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  useEffect(() => {
    fetch("/auth/me/", { credentials: "include" })
      .then((res) => (res.status === 401 ? null : res.json()))
      .then((data) => {
        if (data) {
          setUser(data);
          setAuthState("authenticated");
        } else {
          setAuthState("anonymous");
        }
      })
      .catch(() => setAuthState("anonymous"));
  }, []);

  const authed = authState === "authenticated";
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects/"),
    enabled: authed,
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/identity/users/"),
    enabled: authed,
  });

  const [splashExiting, setSplashExiting] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Le splash reste visible au minimum le temps que la barre se complète (2.1s),
  // même si la session répond instantanément. Dès que les deux conditions sont
  // réunies (session résolue + délai écoulé), on déclenche le fondu de sortie.
  useEffect(() => {
    if (authState === "checking") return;

    const MIN_DISPLAY = 3000; // ms — laisse la barre atteindre 100%
    const elapsed = performance.now();

    const remaining = Math.max(0, MIN_DISPLAY - elapsed);
    const t1 = setTimeout(() => {
      setSplashExiting(true);
      const t2 = setTimeout(() => setShowSplash(false), 420);
      return () => clearTimeout(t2);
    }, remaining);

    return () => clearTimeout(t1);
  }, [authState]);

  if (showSplash) return <SplashScreen exiting={splashExiting} />;

  if (authState === "anonymous") return <Login />;

  const counts = { projects: projects?.length, users: users?.length };

  // Le backend re-verifie systematiquement : masquer un bouton n'est qu'un
  // confort d'usage, jamais la barriere de securite.
  // RBAC neutralisé (RBAC_ENFORCED=False) — le backend reste le garde-fou.
  // canEdit = true pour tout utilisateur authentifié.
  const perms = user?.permissions || [];
  const canEditReference = !!user;

  return (
    <ErrorBoundary>
    <AppShell view={nav} onNavigate={setNav} user={user} counts={counts}>
      {nav === "overview" && <Overview user={user} />}

      {nav === "projects" && (
        <ProjectList
          onCreateClick={() => setNav("new-project")}
          onProjectClick={(id) => {
            setSelectedProjectId(id);
            setNav("project-detail");
          }}
        />
      )}
      {nav === "new-project" && (
        <ProjectCreateForm
          onCreated={(pid) => { if (pid) { setSelectedProjectId(pid); setNav("project-detail"); } else { setNav("projects"); } }}
          onCancel={() => setNav("projects")}
        />
      )}
      {nav === "project-detail" && (
        <ProjectDetail
          projectId={selectedProjectId}
          onBack={() => setNav("projects")}
          onOpenToC={() => setNav("project-toc")}
          onOpenLogframe={() => setNav("project-logframe")}
          canEdit={canEditReference}
        />
      )}
      {nav === "project-toc" && (
        <TheoryOfChange projectId={selectedProjectId} onBack={() => setNav("project-detail")} />
      )}
      {nav === "project-logframe" && (
        <Logframe projectId={selectedProjectId} onBack={() => setNav("project-detail")} />
      )}

      {nav === "masterdata" && <MasterData canEdit={canEditReference} />}
      {nav === "indicator-catalogue" && <IndicatorCatalogue />}
      {nav === "portfolio" && <Portfolio />}
      {nav === "rbac" && <Rbac currentUser={user} />}
    </AppShell>
    </ErrorBoundary>
  );
}

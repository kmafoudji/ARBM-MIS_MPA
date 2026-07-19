import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "./components/AppShell.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import ProjectList from "./pages/ProjectList.jsx";
import ProjectCreateForm from "./pages/ProjectCreateForm.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import TheoryOfChange from "./pages/TheoryOfChange.jsx";
import Logframe from "./pages/Logframe.jsx";
import IndicatorCatalogue from "./pages/IndicatorCatalogue.jsx";
import MasterData from "./pages/MasterData.jsx";
import Rbac from "./pages/Rbac.jsx";
import { apiFetch } from "./api";

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

  if (authState === "checking") {
    return (
      <div className="loading-wrap">
        <span className="spinner" /> Verification de la session...
      </div>
    );
  }

  if (authState === "anonymous") return <Login />;

  const counts = { projects: projects?.length, users: users?.length };

  // Le backend re-verifie systematiquement : masquer un bouton n'est qu'un
  // confort d'usage, jamais la barriere de securite.
  const perms = user?.permissions || [];
  const canEditReference =
    perms.includes("*") ||
    (perms.includes("m1_config_access:create") && perms.includes("m1_config_access:update"));

  return (
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
        <ProjectCreateForm onCreated={() => setNav("projects")} onCancel={() => setNav("projects")} />
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
      {nav === "rbac" && <Rbac />}
    </AppShell>
  );
}

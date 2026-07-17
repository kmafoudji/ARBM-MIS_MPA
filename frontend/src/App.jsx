import { useEffect, useState } from "react";
import AppShell from "./components/AppShell.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import ProjectList from "./pages/ProjectList.jsx";
import ProjectCreateForm from "./pages/ProjectCreateForm.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import MasterData from "./pages/MasterData.jsx";
import Rbac from "./pages/Rbac.jsx";
import { COLOR, FONT } from "./theme";

export default function App() {
  const [authState, setAuthState] = useState("checking"); // "checking" | "authenticated" | "anonymous"
  const [user, setUser] = useState(null);
  const [nav, setNav] = useState("overview");
  const [projectSubView, setProjectSubView] = useState("list"); // "list" | "create" | "detail"
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  useEffect(() => {
    fetch("/auth/me/", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          setAuthState("anonymous");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUser(data);
          setAuthState("authenticated");
        }
      })
      .catch(() => setAuthState("anonymous"));
  }, []);

  function goToProjects() {
    setNav("projects");
    setProjectSubView("list");
  }

  if (authState === "checking") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.body, color: COLOR.muted }}>
        Verification de la session...
      </div>
    );
  }

  if (authState === "anonymous") {
    return <Login />;
  }

  return (
    <AppShell view={nav} onNavigate={(key) => { setNav(key); if (key === "projects") setProjectSubView("list"); }} user={user}>
      {nav === "overview" && <Overview user={user} />}

      {nav === "projects" && projectSubView === "list" && (
        <ProjectList
          onCreateClick={() => setProjectSubView("create")}
          onProjectClick={(id) => {
            setSelectedProjectId(id);
            setProjectSubView("detail");
          }}
        />
      )}
      {nav === "projects" && projectSubView === "create" && (
        <ProjectCreateForm onCreated={goToProjects} onCancel={goToProjects} />
      )}
      {nav === "projects" && projectSubView === "detail" && (
        <ProjectDetail projectId={selectedProjectId} onBack={goToProjects} />
      )}

      {nav === "masterdata" && <MasterData />}
      {nav === "rbac" && <Rbac />}
    </AppShell>
  );
}

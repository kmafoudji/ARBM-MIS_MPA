import { COLOR, FONT, SIDEBAR_WIDTH } from "../theme";

const NAV_ITEMS = [
  { key: "overview", label: "Vue d'ensemble", icon: "◇" },
  { key: "projects", label: "Projets", icon: "▤" },
  { key: "masterdata", label: "Donnees de reference", icon: "▦" },
  { key: "rbac", label: "RBAC & utilisateurs", icon: "◈" },
];

export default function AppShell({ view, onNavigate, user, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${SIDEBAR_WIDTH} 1fr`, minHeight: "100vh" }}>
      <aside
        style={{
          background: COLOR.navyDark,
          color: "white",
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem 0",
        }}
      >
        <div style={{ padding: "0 1.5rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: COLOR.lime, fontSize: "1.3rem" }}>◇</span>
            <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: "1.05rem" }}>
              ARBM-MES
            </span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "1rem 0.75rem" }}>
          {NAV_ITEMS.map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  width: "100%",
                  textAlign: "left",
                  background: active ? "rgba(164,197,63,0.15)" : "transparent",
                  border: "none",
                  borderLeft: active ? `3px solid ${COLOR.lime}` : "3px solid transparent",
                  color: active ? COLOR.lime : "rgba(255,255,255,0.85)",
                  padding: "0.6rem 0.75rem",
                  borderRadius: 6,
                  fontSize: "0.88rem",
                  fontFamily: FONT.body,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  marginBottom: "0.15rem",
                }}
              >
                <span style={{ width: "1.1rem", textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "1rem 1.5rem 0", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.9)", marginBottom: "0.4rem" }}>
            {user?.email}
          </div>
          <a
            href="/auth/logout/"
            style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", textDecoration: "none" }}
          >
            Se deconnecter
          </a>
        </div>
      </aside>

      <main style={{ background: COLOR.paperSoft, minHeight: "100vh" }}>{children}</main>
    </div>
  );
}

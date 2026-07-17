import { COLOR, FONT } from "../theme";

export default function Login() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR.navyDark,
        backgroundImage: `radial-gradient(circle at 15% 20%, ${COLOR.navy} 0%, transparent 45%), radial-gradient(circle at 85% 80%, ${COLOR.limeDark} 0%, transparent 35%)`,
        fontFamily: FONT.body,
      }}
    >
      <div
        style={{
          width: 380,
          background: "rgba(255,255,255,0.98)",
          borderRadius: 16,
          padding: "2.5rem 2rem",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "2rem", color: COLOR.lime, marginBottom: "0.5rem" }}>◇</div>
        <h1
          style={{
            fontFamily: FONT.display,
            color: COLOR.navy,
            fontSize: "1.5rem",
            margin: "0 0 0.25rem",
          }}
        >
          ARBM-MES
        </h1>
        <p style={{ color: COLOR.muted, fontSize: "0.85rem", margin: "0 0 2rem" }}>
          Adaptive Results-Based Management / Monitoring and Evaluation System
        </p>

        <a
          href="/auth/login/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            background: COLOR.navy,
            color: "white",
            textDecoration: "none",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          <MicrosoftLogo />
          Se connecter avec Microsoft
        </a>

        <p style={{ color: COLOR.mutedSoft, fontSize: "0.75rem", marginTop: "1.5rem" }}>
          Reserve au personnel MillenniumPromise et aux partenaires LLF2 autorises.
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0" y="0" width="7" height="7" fill="#F35325" />
      <rect x="9" y="0" width="7" height="7" fill="#81BC06" />
      <rect x="0" y="9" width="7" height="7" fill="#05A6F0" />
      <rect x="9" y="9" width="7" height="7" fill="#FFBA08" />
    </svg>
  );
}

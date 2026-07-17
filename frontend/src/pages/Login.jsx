import { BrandMark, MicrosoftLogo } from "../components/Icons.jsx";

export default function Login() {
  return (
    <div className="login-wrap">
      <div className="login-grid" />

      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">
            <BrandMark />
          </div>
          <div>
            <div className="login-eyebrow">Lives &amp; Livelihoods Fund 2</div>
          </div>
        </div>

        <h1 className="login-title">
          La ou l'impact
          <br />
          devient <span style={{ color: "var(--lime-dark)", fontStyle: "italic" }}>preuve</span>.
        </h1>
        <p className="login-lead">
          Systeme adaptatif de gestion et de suivi-evaluation axe sur les resultats.
          Connectez-vous avec votre compte organisationnel.
        </p>

        <a className="login-btn" href="/auth/login/">
          <MicrosoftLogo />
          Se connecter avec Microsoft
        </a>

        <p className="login-foot">
          Acces reserve au personnel MillenniumPromise et aux partenaires LLF2 autorises.
          L'authentification est geree par Microsoft Entra ID.
        </p>
      </div>

      <div className="login-side">ARBM-MES · POC · 44 projets · 22 pays · 8 hubs</div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { BrandMark, MicrosoftLogo } from "../components/Icons.jsx";

export default function Login() {
  const { t } = useTranslation();
  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark"><BrandMark /></div>
          <div>
            <div className="login-eyebrow">{t("app.llf2")}</div>
          </div>
        </div>
        <h1 className="login-title">
          Where impact
          <br />
          becomes <span style={{ color: "var(--lime-dark)", fontStyle: "italic" }}>evidence</span>.
        </h1>
        <p className="login-lead">
          Adaptive Results-Based Management and Monitoring & Evaluation System.
          Sign in with your organizational account.
        </p>
        <a className="login-btn" href="/auth/login/">
          <MicrosoftLogo />
          {t("auth.sign_in")}
        </a>
        <p className="login-foot">
          Access restricted to MillenniumPromise staff and authorized LLF2 partners.
          Authentication is managed by Microsoft Entra ID.
        </p>
      </div>
      <div className="login-side">{t("app.subtitle")}</div>
    </div>
  );
}

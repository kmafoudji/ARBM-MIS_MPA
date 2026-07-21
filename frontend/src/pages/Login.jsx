import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandMark, MicrosoftLogo, LogoFull } from "../components/Icons.jsx";

export default function Login() {
  const { t } = useTranslation();
  const [mode, setMode] = useState("main"); // "main" | "password"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/auth/login/local/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Invalid email or password.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <LogoFull dark={false} />
        </div>
        <div className="login-eyebrow" style={{ marginBottom: 12 }}>{t("app.llf2")}</div>

        <h1 className="login-title">
          Where impact
          <br />
          becomes <span style={{ color: "var(--lime-dark)", fontStyle: "italic" }}>evidence</span>.
        </h1>
        <p className="login-lead">
          Adaptive Results-Based Management and Monitoring &amp; Evaluation System.
        </p>

        {/* ── Vue principale : deux options ── */}
        {mode === "main" && (
          <>
            {/* Bouton Microsoft (SSO) */}
            <a className="login-btn" href="/auth/login/" style={{ marginBottom: 10 }}>
              <MicrosoftLogo />
              Sign in with Microsoft
            </a>

            {/* Séparateur */}
            <div className="login-separator">
              <span>or</span>
            </div>

            {/* Option mot de passe */}
            <button
              className="login-btn-outline"
              onClick={() => { setMode("password"); setError(null); }}
            >
              Sign in with email &amp; password
            </button>
          </>
        )}

        {/* ── Formulaire email / mot de passe ── */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} style={{ marginTop: 4 }}>
            {error && (
              <div className="login-error">{error}</div>
            )}
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label" style={{ fontSize: 12 }}>Email</label>
              <input
                className="field-input"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="first.last@example.org"
              />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label className="field-label" style={{ fontSize: 12 }}>Password</label>
              <input
                className="field-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button
              className="login-btn"
              type="submit"
              disabled={loading || !email || !password}
              style={{ marginBottom: 10 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="login-btn-outline"
              onClick={() => { setMode("main"); setError(null); }}
            >
              ← Back
            </button>
          </form>
        )}

        <p className="login-foot">
          Access restricted to MillenniumPromise staff and authorized LLF2 partners.
          SSO authentication is managed by Microsoft Entra ID.
        </p>
      </div>
      <div className="login-side">{t("app.subtitle")}</div>
    </div>
  );
}

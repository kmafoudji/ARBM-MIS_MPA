/**
 * SplashScreen — affiché au démarrage pendant la vérification de session
 * et lors des rechargements de page (authState === "checking").
 *
 * Durée totale : ~1.8s d'animations, puis fondu de sortie déclenché par
 * le parent via la prop `exiting` (true quand authState est résolu).
 */
import { useEffect, useState } from "react";

export default function SplashScreen({ exiting = false }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#2B2B2B",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        transition: "opacity 0.4s ease",
        opacity: exiting ? 0 : 1,
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap');

        @keyframes arbm-logo-in {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes arbm-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes arbm-bar-fill {
          0%   { width: 0%; }
          50%  { width: 65%; }
          75%  { width: 82%; }
          92%  { width: 93%; }
          100% { width: 100%; }
        }
        @keyframes arbm-dot-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }

        .arbm-splash-logo {
          animation: arbm-logo-in 0.7s cubic-bezier(0.16,1,0.3,1) both;
        }
        .arbm-splash-name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.03em;
          margin-top: 20px;
          animation: arbm-fade-up 0.55s 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        .arbm-splash-fund {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: #A4C53F;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          margin-top: 7px;
          animation: arbm-fade-up 0.55s 0.55s cubic-bezier(0.16,1,0.3,1) both;
        }
        .arbm-splash-tagline {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12px;
          color: rgba(255,255,255,0.3);
          margin-top: 36px;
          animation: arbm-fade-up 0.5s 0.85s cubic-bezier(0.16,1,0.3,1) both;
        }
        .arbm-splash-dots {
          display: flex;
          gap: 6px;
          margin-top: 20px;
          animation: arbm-fade-up 0.5s 1.05s cubic-bezier(0.16,1,0.3,1) both;
        }
        .arbm-splash-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
        }
        .arbm-splash-dot.active {
          background: #0EB584;
          animation: arbm-dot-pulse 1.4s 1.1s ease-in-out infinite;
        }
        .arbm-splash-bar-track {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.05);
        }
        .arbm-splash-bar {
          height: 100%;
          background: #0EB584;
          border-radius: 0 2px 2px 0;
          width: 0%;
          animation: arbm-bar-fill 2.8s 0.2s cubic-bezier(0.4,0,0.2,1) forwards;
        }
      `}</style>

      {/* Logo */}
      <img
        className="arbm-splash-logo"
        src="/logos/llf/llf-logo-white.png"
        alt="Lives and Livelihoods Fund"
        style={{ height: 72, width: "auto" }}
      />

      {/* Nom */}
      <div className="arbm-splash-name">ARBM-MIS</div>

      {/* Sous-titre IsDB / LLF2 */}
      <div className="arbm-splash-fund">Lives &amp; Livelihoods Fund · LLF2</div>

      {/* Tagline */}
      <div className="arbm-splash-tagline">
        Adaptive Results-Based Management System
      </div>

      {/* Indicateur de chargement */}
      <div className="arbm-splash-dots">
        <div className="arbm-splash-dot active" />
        <div className="arbm-splash-dot" />
        <div className="arbm-splash-dot" />
      </div>

      {/* Barre de progression en bas */}
      <div className="arbm-splash-bar-track">
        <div className="arbm-splash-bar" />
      </div>
    </div>
  );
}

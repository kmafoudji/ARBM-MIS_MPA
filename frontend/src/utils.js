/**
 * utils.js — Utilitaires globaux ARBM-MES
 *
 * Importer dans tout composant qui affiche des nombres :
 *   import { fmtNum, fmtPct, fmtCurrency } from "../utils";
 *   import { fmtNum } from "../../utils";  // depuis pages/
 */

/**
 * fmtNum — Formate un nombre en supprimant les décimales inutiles.
 *
 * "1500.0000" → "1 500"
 * "3.5000"    → "3.5"
 * "75.2500"   → "75.25"
 * null / ""   → "—"
 *
 * @param {string|number|null} val  Valeur à formater
 * @param {object}             opts Options optionnelles
 * @param {number}  opts.maxDecimals  Nombre max de décimales (défaut : 4)
 * @param {string}  opts.empty        Texte si null/vide (défaut : "—")
 * @param {string}  opts.locale       Locale (défaut : navigator.language)
 */
export function fmtNum(val, { maxDecimals = 4, empty = "—", locale = "en-US" } = {}) {
  if (val === null || val === undefined || val === "") return empty;
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return String(val);

  // Entier → pas de décimales
  if (Number.isInteger(n)) {
    return n.toLocaleString(locale);
  }

  // Supprimer les zéros trailing tout en respectant maxDecimals
  return parseFloat(n.toFixed(maxDecimals)).toLocaleString(locale, {
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * fmtPct — Formate un pourcentage.
 *
 * 75.2500 → "75.25%"
 * 100     → "100%"
 * null    → "—"
 */
export function fmtPct(val, opts = {}) {
  const s = fmtNum(val, { maxDecimals: 2, ...opts });
  return s === (opts.empty ?? "—") ? s : `${s}%`;
}

/**
 * fmtCurrency — Formate un montant monétaire.
 *
 * 12500000    → "12,500,000"
 * 3500000.50  → "3,500,000.5"
 * null        → "—"
 *
 * @param {string|number|null} val
 * @param {string}             currency  Code ISO (ex. "USD"). Si fourni, préfixe le montant.
 */
export function fmtCurrency(val, currency, opts = {}) {
  if (val === null || val === undefined || val === "") return opts.empty ?? "—";
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return String(val);

  const formatted = fmtNum(n, { maxDecimals: 2, ...opts });
  return currency ? `${currency} ${formatted}` : formatted;
}

/**
 * parseNum — Convertit une valeur API (string ou number) en float.
 * Retourne null si la valeur est vide/null/NaN.
 */
export function parseNum(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? null : n;
}

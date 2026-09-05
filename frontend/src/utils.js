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

/**
 * sectorOptions — Options de Select/MultiSelect pour la taxonomie LLF2 a deux
 * niveaux (ADR 0007) : seuls les secteurs (avec parent) sont selectionnables,
 * groupes sous leur pilier. Les piliers eux-memes ne sont jamais proposes :
 * le backend refuse un pilier comme secteur d'un projet.
 *
 * @param {Array}  sectors        Reponse brute de /api/reference/sectors/
 * @param {object} opts
 * @param {function} opts.exclude  (sector) => bool, secteurs a retirer
 * @param {boolean}  opts.stringIds valeurs en String (Select) ou nombre (MultiSelect)
 */
export function sectorOptions(sectors, { exclude, stringIds = false, activeOnly = true } = {}) {
  return (sectors || [])
    .filter((s) => s.parent !== null && s.parent !== undefined)
    .filter((s) => !activeOnly || s.is_active !== false)
    .filter((s) => !exclude || !exclude(s))
    .map((s) => ({
      value: stringIds ? String(s.id) : s.id,
      label: s.name,
      group: s.pillar_name || s.parent_name || "",
    }));
}

/**
 * pillarOptions — Les piliers (premier niveau) pour un filtre "par pilier".
 */
export function pillarOptions(sectors, { stringIds = false } = {}) {
  return (sectors || [])
    .filter((s) => s.parent === null || s.parent === undefined)
    .map((s) => ({ value: stringIds ? String(s.id) : s.id, label: s.name }));
}

/**
 * groupSectorOptions — [[pillar, [sectors]]] pour un <select> natif avec
 * <optgroup> : le pilier est lui-meme une option ("All <pillar>"), le
 * backend l'etend a ses secteurs.
 */
export function groupSectorOptions(sectors) {
  const list = sectors || [];
  return list
    .filter((s) => s.parent === null || s.parent === undefined)
    .map((p) => [p, list.filter((s) => s.parent === p.id)]);
}

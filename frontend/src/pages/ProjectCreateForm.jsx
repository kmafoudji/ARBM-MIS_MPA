import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";

/* ── Constantes ─────────────────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: "Basic Identity",        icon: "tag",          sub: "Name, countries, sector"         },
  { id: 2, label: "Strategic Alignment",   icon: "layers",       sub: "SDGs, classification, markers"   },
  { id: 3, label: "Financial Envelope",    icon: "wallet",       sub: "Indicative budget"                },
  { id: 4, label: "Reporting",             icon: "trending-up",  sub: "Frequency, first deadline"        },
];

const GENDER_MARKER_CHOICES = [
  { value: "0", label: "Category 0 — Not targeted" },
  { value: "1", label: "Category 1 — Significant"  },
  { value: "2", label: "Category 2 — Principal"    },
];
const RIO_CHOICES = [
  { value: "not_targeted", label: "Not targeted" },
  { value: "significant",  label: "Significant"  },
  { value: "principal",    label: "Principal"     },
];
const FRAGILITY_CHOICES = [
  { value: "fcv",     label: "FCV"     },
  { value: "pre_fcv", label: "Pre-FCV" },
  { value: "stable",  label: "Stable"  },
];
const RISK_CHOICES = [
  { value: "low",          label: "Low"          },
  { value: "moderate",     label: "Moderate"      },
  { value: "substantial",  label: "Substantial"   },
  { value: "high",         label: "High"          },
];
const MODALITY_CHOICES = [
  { value: "direct",         label: "Direct"         },
  { value: "country_systems",label: "Country systems" },
  { value: "ngo",            label: "NGO"             },
  { value: "private",        label: "Private"         },
  { value: "multi_actor",    label: "Multi-actor"     },
  { value: "hybrid",         label: "Hybrid"          },
];
const GEO_CHOICES = [
  { value: "urban",               label: "Urban"               },
  { value: "peri_urban",          label: "Peri-urban"          },
  { value: "rural",               label: "Rural"               },
  { value: "remote",              label: "Remote"              },
  { value: "mixed_multi_district",label: "Mixed / multi-district" },
];
const FREQ_CHOICES = [
  { value: "quarterly",   label: "Quarterly"   },
  { value: "semi_annual", label: "Semi-annual" },
  { value: "annual",      label: "Annual"      },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */
function FieldSelect({ id, label, required, value, onChange, choices, placeholder }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      <select id={id} className="field-select" value={value} onChange={onChange} required={required}>
        <option value="">{placeholder || "Select…"}</option>
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </div>
  );
}

/* ── StepIndicator ──────────────────────────────────────────────────────── */
function StepIndicator({ current, maxReached }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: "var(--s-4)", overflowX: "auto" }}>
      {STEPS.map((s, i) => {
        const done    = s.id < current;
        const active  = s.id === current;
        const reachable = s.id <= maxReached;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              opacity: reachable ? 1 : 0.4,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "var(--lime, #A4C53F)" : active ? "var(--navy, #1B5A8C)" : "var(--rule)",
                color: (done || active) ? "#fff" : "var(--text-muted)",
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {done ? <Icon name="check" size={14} /> : s.id}
              </div>
              <div style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: active ? "var(--navy, #1B5A8C)" : "var(--text-muted)" }}>
                  {s.label}
                </div>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 8px", marginBottom: 20,
                background: done ? "var(--lime, #A4C53F)" : "var(--rule)",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function ProjectCreateForm({ onCreated, onCancel }) {
  const qc = useQueryClient();
  const [step, setStep]           = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [error, setError]         = useState(null);
  const projectIdRef = useRef(null);   // ref : pas de stale closure
  const savingRef    = useRef(false);  // ref : évite les double-clics
  const [saving, setSaving]       = useState(false); // pour le rendu bouton

  /* ── Form state (toutes étapes) ── */
  const [f, setF] = useState({
    // Step 1
    name: "", countryIds: [], leadCountryId: "", primarySector: "",
    contributingSectorIds: [], lifecycle_stage: "concept_note",
    // Step 2
    primary_sdg: "", contributingSdgIds: [],
    gender_marker: "", implementation_modality: "", geographic_typology: "",
    fragility_status: "", risk_rating: "", cross_cutting_theme_ids: [],
    rio_marker_mitigation: "not_targeted", rio_marker_adaptation: "not_targeted",
    rio_marker_biodiversity: "not_targeted", rio_marker_desertification: "not_targeted",
    // Step 3
    budget_amount: "",
    // Step 4
    reporting_frequency: "", next_reporting_due: "",
  });

  /* ── Référentiels ── */
  const { data: countries   } = useQuery({ queryKey: ["countries"],  queryFn: () => apiFetch("/api/reference/countries/")  });
  const { data: sectors     } = useQuery({ queryKey: ["sectors"],    queryFn: () => apiFetch("/api/reference/sectors/")    });
  const { data: sdgs        } = useQuery({ queryKey: ["sdgs"],       queryFn: () => apiFetch("/api/reference/sdgs/")       });
  const { data: themes      } = useQuery({ queryKey: ["ref","cross_cutting_themes"], queryFn: () => apiFetch("/api/reference/cross-cutting-themes/") });

  /* ── Helpers champ ── */
  const set = (k, v) => setF((f) => ({ ...f, [k]: v }));
  function handleChange(e) { set(e.target.name, e.target.value); }
  function handleMulti(field, e) {
    const vals = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    if (field === "countryIds") {
      const leadOk = vals.includes(Number(f.leadCountryId));
      setF((prev) => ({ ...prev, countryIds: vals, leadCountryId: leadOk ? prev.leadCountryId : vals[0] || "" }));
    } else {
      set(field, vals);
    }
  }

  const selectedCountries         = (countries || []).filter((c) => f.countryIds.includes(c.id));
  const contributingSectorChoices = (sectors   || []).filter((s) => String(s.id)     !== String(f.primarySector));
  const contributingSdgChoices    = (sdgs      || []).filter((s) => String(s.number) !== String(f.primary_sdg));

  /* ── Validation par étape ── */
  function validate(s) {
    if (s === 1) {
      if (!f.name.trim())          return "Project name is required.";
      if (!f.countryIds.length)    return "At least one country is required.";
      if (!f.primarySector)        return "Primary sector is required.";
    }
    return null;
  }

  /* ── Sauvegarder l'étape courante ── */
  async function saveCurrentStep() {
    if (savingRef.current) return null; // anti double-clic
    savingRef.current = true;
    setError(null);
    setSaving(true);
    try {
      if (step === 1 && !projectIdRef.current) {
        // Création initiale
        const payload = {
          name: f.name,
          country_ids: f.countryIds,
          lead_country_id: Number(f.leadCountryId || f.countryIds[0]),
          primary_sector: Number(f.primarySector),
          contributing_sector_ids: f.contributingSectorIds,
          budget_amount: f.budget_amount || null,
          primary_sdg: f.primary_sdg ? Number(f.primary_sdg) : null,
          contributing_sdg_ids: f.contributingSdgIds,
        };
        const proj = await apiFetch("/api/projects/", { method: "POST", body: JSON.stringify(payload) });
        projectIdRef.current = proj.id;
        qc.invalidateQueries({ queryKey: ["projects"] });
        return proj.id;
      }

      const pid = projectIdRef.current;

      if (step === 1 && pid) {
        // Mise à jour step 1 via endpoint dédié
        await apiFetch(`/api/projects/${pid}/basic/`, { method: "PATCH", body: JSON.stringify({
          name: f.name,
          country_ids: f.countryIds,
          lead_country_id: Number(f.leadCountryId || f.countryIds[0]),
          primary_sector: Number(f.primarySector),
          contributing_sector_ids: f.contributingSectorIds,
          budget_amount: f.budget_amount || null,
        })});
      }

      if (step === 2) {
        await apiFetch(`/api/projects/${pid}/`, { method: "PATCH", body: JSON.stringify({
          primary_sdg: f.primary_sdg ? Number(f.primary_sdg) : null,
          contributing_sdg_ids: f.contributingSdgIds,
          gender_marker: f.gender_marker || null,
          implementation_modality: f.implementation_modality || null,
          geographic_typology: f.geographic_typology || null,
          fragility_status: f.fragility_status || null,
          risk_rating: f.risk_rating || null,
          cross_cutting_theme_ids: f.cross_cutting_theme_ids,
          rio_marker_mitigation: f.rio_marker_mitigation,
          rio_marker_adaptation: f.rio_marker_adaptation,
          rio_marker_biodiversity: f.rio_marker_biodiversity,
          rio_marker_desertification: f.rio_marker_desertification,
        })});
      }

      if (step === 3) {
        await apiFetch(`/api/projects/${pid}/`, { method: "PATCH", body: JSON.stringify({
          budget_amount: f.budget_amount || null,
        })});
      }

      if (step === 4) {
        await apiFetch(`/api/projects/${pid}/reporting-config/`, { method: "PATCH", body: JSON.stringify({
          reporting_frequency: f.reporting_frequency || null,
          next_reporting_due: f.next_reporting_due || null,
        })});
      }

      qc.invalidateQueries({ queryKey: ["projects"] });
      return pid;
    } catch (e) {
      const detail = e?.detail || e?.message || "Save failed.";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /* ── Navigation ── */
  async function goNext() {
    const err = validate(step);
    if (err) { setError(err); return; }
    const pid = await saveCurrentStep();
    if (!pid) return;
    const next = step + 1;
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  }

  async function goPrev() {
    await saveCurrentStep(); // sauvegarde silencieuse (ignorer erreur optionnelle)
    setStep((s) => s - 1);
  }

  async function finish() {
    const pid = await saveCurrentStep();
    if (!pid) return;
    qc.invalidateQueries({ queryKey: ["projects"] });
    onCreated(pid);
  }

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="view" style={{ maxWidth: 860 }}>
      <div className="view-header">
        <div className="view-eyebrow">Registration Wizard · SF-1</div>
        <h1 className="view-title">New Project</h1>
        <p className="view-lead">
          Progressive gating — only the fields required at the current lifecycle stage are mandatory.
          Each step is saved before moving forward.
        </p>
      </div>

      <StepIndicator current={step} maxReached={maxReached} />

      {/* ── STEP 1 : Basic Identity ── */}
      {step === 1 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="tag" size={15} style={{ marginRight: 6 }} />Basic Identity</h2>
              <div className="card-sub">Name, geographic scope, primary sector</div>
            </div>
            <span className="badge badge-lime">Required</span>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label" htmlFor="name">Project name <span className="req">*</span></label>
              <input id="name" className="field-input" name="name" value={f.name} onChange={handleChange}
                placeholder="e.g. Livestock & Livelihood Development" />
            </div>

            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="countries">Countries <span className="req">*</span></label>
                <select id="countries" className="field-select field-multi" multiple
                  value={f.countryIds.map(String)} onChange={(e) => handleMulti("countryIds", e)}>
                  {countries?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="field-help">Ctrl/Cmd + click for multi-country.</span>
              </div>

              {selectedCountries.length > 1 && (
                <div className="field">
                  <label className="field-label" htmlFor="lead">Lead country <span className="req">*</span></label>
                  <select id="lead" className="field-select" name="leadCountryId" value={f.leadCountryId} onChange={handleChange}>
                    {selectedCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="field-help">Used for display and project code only.</span>
                </div>
              )}

              <div className="field">
                <label className="field-label" htmlFor="primarySector">Primary sector <span className="req">*</span></label>
                <select id="primarySector" className="field-select" name="primarySector" value={f.primarySector} onChange={handleChange}>
                  <option value="">Select…</option>
                  {sectors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="contribSectors">Contributing sectors</label>
                <select id="contribSectors" className="field-select field-multi" multiple
                  value={f.contributingSectorIds.map(String)} onChange={(e) => handleMulti("contributingSectorIds", e)}>
                  {contributingSectorChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2 : Strategic Alignment ── */}
      {step === 2 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="layers" size={15} style={{ marginRight: 6 }} />Strategic Alignment</h2>
              <div className="card-sub">SDGs, classification SF-2 — required at BED Approved gate</div>
            </div>
            <span className="badge">Optional now</span>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="primarySdg">Primary SDG</label>
                <select id="primarySdg" className="field-select" name="primary_sdg" value={f.primary_sdg} onChange={handleChange}>
                  <option value="">Select…</option>
                  {sdgs?.map((s) => <option key={s.number} value={s.number}>SDG {s.number} — {s.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="contribSdgs">Contributing SDGs</label>
                <select id="contribSdgs" className="field-select field-multi" multiple
                  value={f.contributingSdgIds.map(String)} onChange={(e) => handleMulti("contributingSdgIds", e)}>
                  {contributingSdgChoices.map((s) => <option key={s.number} value={s.number}>SDG {s.number} — {s.name}</option>)}
                </select>
              </div>

              <FieldSelect id="genderMarker" label="Gender Marker" value={f.gender_marker}
                onChange={(e) => set("gender_marker", e.target.value)} choices={GENDER_MARKER_CHOICES} />

              <FieldSelect id="modality" label="Implementation Modality" value={f.implementation_modality}
                onChange={(e) => set("implementation_modality", e.target.value)} choices={MODALITY_CHOICES} />

              <FieldSelect id="geoTypo" label="Geographic Typology" value={f.geographic_typology}
                onChange={(e) => set("geographic_typology", e.target.value)} choices={GEO_CHOICES} />

              <FieldSelect id="fragility" label="Fragility Status" value={f.fragility_status}
                onChange={(e) => set("fragility_status", e.target.value)} choices={FRAGILITY_CHOICES} />

              <FieldSelect id="risk" label="Risk Rating" value={f.risk_rating}
                onChange={(e) => set("risk_rating", e.target.value)} choices={RISK_CHOICES} />

              <div className="field">
                <label className="field-label" htmlFor="themes">Cross-Cutting Themes</label>
                <select id="themes" className="field-select field-multi" multiple
                  value={f.cross_cutting_theme_ids.map(String)}
                  onChange={(e) => set("cross_cutting_theme_ids", Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
                  {(themes || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <div className="card-sub" style={{ marginBottom: 8 }}>Rio Markers (OECD-DAC)</div>
              <div className="grid grid-2">
                {[
                  ["rio_marker_mitigation",     "Climate Mitigation"],
                  ["rio_marker_adaptation",      "Climate Adaptation"],
                  ["rio_marker_biodiversity",    "Biodiversity"],
                  ["rio_marker_desertification", "Desertification"],
                ].map(([key, label]) => (
                  <FieldSelect key={key} id={key} label={label} value={f[key]}
                    onChange={(e) => set(key, e.target.value)} choices={RIO_CHOICES} placeholder="Not targeted" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 : Financial Envelope ── */}
      {step === 3 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="wallet" size={15} style={{ marginRight: 6 }} />Financial Envelope</h2>
              <div className="card-sub">Indicative budget at Concept Note — detailed sources added from the project sheet</div>
            </div>
            <span className="badge">Optional now</span>
          </div>
          <div className="card-body">
            <div className="field" style={{ maxWidth: 300 }}>
              <label className="field-label" htmlFor="budget">Indicative Budget (USD)</label>
              <input id="budget" className="field-input" type="number" name="budget_amount"
                value={f.budget_amount} onChange={handleChange} placeholder="e.g. 12500000" />
              <span className="field-help">Financing sources and component breakdown are configured from the project sheet after registration.</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4 : Reporting ── */}
      {step === 4 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="trending-up" size={15} style={{ marginRight: 6 }} />Reporting Configuration</h2>
              <div className="card-sub">SF-5 · Reporting cycle and first deadline</div>
            </div>
            <span className="badge">Optional now</span>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <FieldSelect id="freq" label="Reporting Frequency" value={f.reporting_frequency}
                onChange={(e) => set("reporting_frequency", e.target.value)} choices={FREQ_CHOICES} />
              <div className="field">
                <label className="field-label" htmlFor="nextDue">First Deadline</label>
                <input id="nextDue" className="field-input" type="date" name="next_reporting_due"
                  value={f.next_reporting_due} onChange={handleChange} />
              </div>
            </div>
            <div className="notice notice-info" style={{ marginTop: 8, fontSize: 12 }}>
              The full reporting schedule (all periods and deadlines) will be auto-generated from these settings once the project reaches the Effective stage.
            </div>
          </div>
        </div>
      )}

      {/* ── Erreur ── */}
      {error && (
        <div className="field-error mt-3">{error}</div>
      )}

      {/* ── Navigation ── */}
      <div className="row mt-4" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost" type="button" onClick={step === 1 ? onCancel : goPrev}
          disabled={saving}>
          {step === 1 ? "Cancel" : "← Previous"}
        </button>
        <div className="row" style={{ gap: 8 }}>
          {step < STEPS.length ? (
            <button className="btn btn-primary row" style={{ gap: 6 }} type="button" onClick={goNext} disabled={saving}>
              {saving ? "Saving…" : <><span>Next</span> <Icon name="chevron-right" size={14} /></>}
            </button>
          ) : (
            <button className="btn btn-primary row" style={{ gap: 6 }} type="button" onClick={finish} disabled={saving}>
              {saving ? "Saving…" : <><Icon name="check" size={14} /> <span>Finish & open project</span></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

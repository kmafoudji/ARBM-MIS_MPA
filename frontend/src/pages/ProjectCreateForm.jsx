import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { sectorOptions } from "../utils.js";
import Icon from "../components/Icon";
import MultiSelect from "../components/MultiSelect";
import Select from "../components/Select";
import { INVESTMENT_CYCLE_CHOICES } from "../choices";

/* ── Constantes ─────────────────────────────────────────────────────────── */
const STEPS_OLD = [];
const STEPS = [
  { id: 1, label: "Basic Identity" },
  { id: 2, label: "Classification" },
  { id: 3, label: "Confirm" },
];

const FREQ_CHOICES = [
  { value: "monthly",     label: "Monthly"     },
  { value: "quarterly",   label: "Quarterly"   },
  { value: "semi_annual", label: "Semi-annual" },
  { value: "annual",      label: "Annual"      },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */
const labelOf = (choices, value) => (choices || []).find((c) => c.value === value)?.label || "—";
// onChange receives the value itself (Select), not an event.
function FieldSelect({ id, label, required, value, onChange, choices, placeholder }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      <Select id={id} options={choices} value={value} onChange={onChange}
        required={required} placeholder={placeholder} />
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
                background: done ? "var(--lime, var(--lime))" : active ? "var(--navy, var(--blue))" : "var(--rule)",
                color: (done || active) ? "var(--paper)" : "var(--text-muted)",
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {done ? <Icon name="check" size={14} /> : s.id}
              </div>
              <div style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: active ? "var(--navy, var(--blue))" : "var(--text-muted)" }}>
                  {s.label}
                </div>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 8px", marginBottom: 20,
                background: done ? "var(--lime, var(--lime))" : "var(--rule)",
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
    name: "", official_reference_number: "", investment_cycle: "", countryIds: [], leadCountryId: "", primarySector: "",
    contributingSectorIds: [], lifecycle_stage: "LS001",
    // Step 2
    sdgIds: [],
    we_category: "", risk_rating: "", climate_marker: "",
    // Step 3
    budget_amount: "",
    // Step 4
    reporting_frequency: "", next_reporting_due: "",
  });

  /* ── Référentiels ── */
  const { data: countries   } = useQuery({ queryKey: ["countries"],  queryFn: () => apiFetch("/api/reference/countries/")  });
  const { data: sectors     } = useQuery({ queryKey: ["sectors"],    queryFn: () => apiFetch("/api/reference/sectors/")    });
  const { data: sdgs        } = useQuery({ queryKey: ["sdgs"],       queryFn: () => apiFetch("/api/reference/sdgs/")       });
  // Same source (and query key) as the Classification form in ProjectDetail:
  // the vocabularies live in the backend only.
  const { data: classificationChoices } = useQuery({
    queryKey: ["classification-choices"],
    queryFn: () => apiFetch("/api/projects/classification-choices/"),
  });

  /* ── Helpers champ ── */
  const set = (k, v) => setF((f) => ({ ...f, [k]: v }));
  function handleChange(e) { set(e.target.name, e.target.value); }
  function setCountryIds(vals) {
    const leadOk = vals.includes(Number(f.leadCountryId));
    setF((prev) => ({ ...prev, countryIds: vals, leadCountryId: leadOk ? prev.leadCountryId : vals[0] || "" }));
  }

  const selectedCountries         = (countries || []).filter((c) => f.countryIds.includes(c.id));
  // ADR 0007: only sectors are selectable, grouped under their pillar.
  const primarySectorOptions      = sectorOptions(sectors, { stringIds: true });
  const contributingSectorChoices = sectorOptions(sectors, { exclude: (s) => String(s.id) === String(f.primarySector) });

  /* ── Validation par étape ── */
  function validate(s) {
    if (s === 1) {
      if (!f.name.trim())       return "Project name is required.";
      if (!f.official_reference_number.trim()) return "Official reference number is required.";
      if (!f.countryIds.length) return "At least one country is required.";
    }
    return null;
  }

  /* ── Navigation sans sauvegarde intermédiaire ── */
  function goNext() {
    const err = validate(step);
    if (err) { setError(err); return; }
    setError(null);
    const next = step + 1;
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  }

  function goPrev() {
    setError(null);
    setStep((s) => s - 1);
  }

  /* ── Création unique au finish ── */
  async function finish() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSaving(true);
    try {
      // 1. Créer le projet
      const payload = {
        name: f.name,
        official_reference_number: f.official_reference_number.trim(),
        investment_cycle: f.investment_cycle || null,
        country_ids: f.countryIds,
        lead_country_id: Number(f.leadCountryId || f.countryIds[0]),
        primary_sector: f.primarySector ? Number(f.primarySector) : null,
        contributing_sector_ids: f.contributingSectorIds,
        sdg_ids: f.sdgIds,
      };
      const proj = await apiFetch("/api/projects/", { method: "POST", body: JSON.stringify(payload) });
      const pid = proj.id;

      // 2. Enregistrer la classification (étape 2) en PATCH
      await apiFetch(`/api/projects/${pid}/`, { method: "PATCH", body: JSON.stringify({
        we_category: f.we_category || null,
        risk_rating: f.risk_rating || null,
        climate_marker: f.climate_marker || null,
      })});

      qc.invalidateQueries({ queryKey: ["projects"] });
      onCreated(pid);
    } catch (e) {
      let detail = e?.detail || e?.message || "Save failed.";
      if (detail && typeof detail === "object" && detail.official_reference_number) {
        detail = `Official reference number: ${[].concat(detail.official_reference_number).join(" ")}`;
      }
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
              <div className="card-sub">Name, countries, primary sector and SDG</div>
            </div>
            <span className="badge badge-lime">Required</span>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label" htmlFor="name">Project name <span className="req">*</span></label>
              <input id="name" className="field-input" name="name" value={f.name} onChange={handleChange}
                placeholder="e.g. Livestock & Livelihood Development" />
            </div>

            <div className="field" style={{ maxWidth: 260 }}>
              <label className="field-label" htmlFor="official_reference_number">Official reference number <span className="req">*</span></label>
              <input id="official_reference_number" className="field-input" name="official_reference_number"
                value={f.official_reference_number} onChange={handleChange}
                placeholder="e.g. SLE1013" maxLength={50} />
              <span className="field-help">The identifier used everywhere in the system. Must be unique.</span>
            </div>

            <div style={{ maxWidth: 260 }}>
              <FieldSelect id="investmentCycle" label="Investment cycle" value={f.investment_cycle}
                onChange={(v) => set("investment_cycle", v)} choices={INVESTMENT_CYCLE_CHOICES} />
            </div>

            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="countries">Countries <span className="req">*</span></label>
                <MultiSelect id="countries" placeholder="Search countries..."
                  options={(countries || []).map((c) => ({ value: c.id, label: c.name, iso2: c.iso2 }))}
                  value={f.countryIds} onChange={setCountryIds} />
              </div>

              {selectedCountries.length > 1 && (
                <div className="field">
                  <label className="field-label" htmlFor="lead">Lead country <span className="req">*</span></label>
                  <Select id="lead" name="leadCountryId" required placeholder="Select lead country…"
                    options={selectedCountries.map((c) => ({ value: String(c.id), label: c.name, iso2: c.iso2 }))}
                    value={f.leadCountryId} onChange={(v) => set("leadCountryId", v)} />
                  <span className="field-help">Used for display and project code only.</span>
                </div>
              )}

              <div className="field">
                <label className="field-label" htmlFor="primarySector">Primary sector</label>
                <Select id="primarySector" name="primarySector" placeholder="Select…"
                  options={primarySectorOptions}
                  value={f.primarySector} onChange={(v) => set("primarySector", v)} />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="sdgs">SDGs</label>
                <MultiSelect id="sdgs" placeholder="Search SDGs..."
                  options={(sdgs || []).map((s) => ({ value: s.number, label: `SDG ${s.number} — ${s.name}` }))}
                  value={f.sdgIds} onChange={(v) => set("sdgIds", v)} />
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
              <div className="card-sub">Classification SF-2 — required before BED Approved</div>
            </div>
            <span className="badge">Optional now</span>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="contribSectors">Contributing sectors</label>
                <MultiSelect id="contribSectors" placeholder="Search sectors..."
                  options={contributingSectorChoices}
                  value={f.contributingSectorIds} onChange={(v) => set("contributingSectorIds", v)} />
              </div>

              <FieldSelect id="weCategory" label="WE Category" value={f.we_category}
                onChange={(v) => set("we_category", v)} choices={classificationChoices?.we_category || []} />

              <FieldSelect id="risk" label="Risk category" value={f.risk_rating}
                onChange={(v) => set("risk_rating", v)} choices={classificationChoices?.risk_rating || []} />

              <FieldSelect id="climateMarker" label="Climate marker" value={f.climate_marker}
                onChange={(v) => set("climate_marker", v)} choices={classificationChoices?.climate_marker || []} />
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 : Confirmation ── */}
      {step === 3 && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="check" size={15} style={{ marginRight: 6 }} />Confirm & Create</h2>
              <div className="card-sub">Review all information before creating the project</div>
            </div>
            <span className="badge badge-lime">Final step</span>
          </div>
          <div className="card-body">

            {/* Section Basic Identity */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="tag" size={12} style={{ color: "var(--lime)" }} /> Basic Identity
              </div>
              <div className="dl">
                <div><div className="dl-term">Project name</div><div className="dl-desc" style={{ fontWeight: 600 }}>{f.name}</div></div>
                <div><div className="dl-term">Official reference</div><div className="dl-desc text-mono">{f.official_reference_number}</div></div>
                <div><div className="dl-term">Investment cycle</div><div className="dl-desc">{f.investment_cycle || "—"}</div></div>
                <div><div className="dl-term">Countries</div>
                  <div className="dl-desc">{selectedCountries.map(c => c.name).join(", ") || "—"}</div></div>
                {selectedCountries.length > 1 && (
                  <div><div className="dl-term">Lead country</div>
                    <div className="dl-desc">{countries?.find(c => String(c.id) === String(f.leadCountryId))?.name || "—"}</div></div>
                )}
                <div><div className="dl-term">Primary sector</div>
                  <div className="dl-desc">{sectors?.find(s => String(s.id) === String(f.primarySector))?.name || "—"}</div></div>
                {f.contributingSectorIds.length > 0 && (
                  <div><div className="dl-term">Contributing sectors</div>
                    <div className="dl-desc">{sectors?.filter(s => f.contributingSectorIds.map(String).includes(String(s.id))).map(s => s.name).join(", ")}</div></div>
                )}
                <div><div className="dl-term">SDGs</div>
                  <div className="dl-desc">{f.sdgIds.length > 0 ? f.sdgIds.map(n => `SDG ${n}`).join(", ") : "—"}</div></div>
              </div>
            </div>

            {/* Section Classification */}
            <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="layers" size={12} style={{ color: "var(--lime)" }} /> Classification & Alignment
              </div>
              <div className="dl">
                <div><div className="dl-term">WE Category</div>
                  <div className="dl-desc">{labelOf(classificationChoices?.we_category, f.we_category)}</div></div>
                <div><div className="dl-term">Risk category</div>
                  <div className="dl-desc">{labelOf(classificationChoices?.risk_rating, f.risk_rating)}</div></div>
                <div><div className="dl-term">Climate marker</div>
                  <div className="dl-desc">{labelOf(classificationChoices?.climate_marker, f.climate_marker)}</div></div>
              </div>
            </div>

            <div className="notice notice-info" style={{ fontSize: 13 }}>
              <span style={{ marginRight: 8 }}>ℹ️</span>
              Financial envelope, reporting schedule, project dates and PAD can be added from the project tabs after creation.
            </div>
          </div>
        </div>
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
              {saving ? "Saving…" : <><span>Next</span> <Icon name="arrow-right" size={14} /></>}
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

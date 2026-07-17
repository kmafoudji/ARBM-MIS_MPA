import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

export default function ProjectCreateForm({ onCreated, onCancel }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    countryIds: [],
    leadCountryId: "",
    primarySector: "",
    contributingSectorIds: [],
    budget_amount: "",
    primary_sdg: "",
    contributingSdgIds: [],
  });

  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: sectors } = useQuery({ queryKey: ["sectors"], queryFn: () => apiFetch("/api/reference/sectors/") });
  const { data: sdgs } = useQuery({ queryKey: ["sdgs"], queryFn: () => apiFetch("/api/reference/sdgs/") });

  const mutation = useMutation({
    mutationFn: (payload) => apiFetch("/api/projects/", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated();
    },
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleMulti(field, e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    if (field === "countryIds") {
      const leadStillValid = selected.includes(Number(form.leadCountryId));
      setForm({ ...form, countryIds: selected, leadCountryId: leadStillValid ? form.leadCountryId : selected[0] || "" });
      return;
    }
    setForm({ ...form, [field]: selected });
  }

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      name: form.name,
      country_ids: form.countryIds,
      lead_country_id: Number(form.leadCountryId),
      primary_sector: Number(form.primarySector),
      contributing_sector_ids: form.contributingSectorIds,
      budget_amount: form.budget_amount || null,
      primary_sdg: form.primary_sdg ? Number(form.primary_sdg) : null,
      contributing_sdg_ids: form.contributingSdgIds,
    });
  }

  const selectedCountries = (countries || []).filter((c) => form.countryIds.includes(c.id));
  const contributingSectorChoices = (sectors || []).filter((s) => String(s.id) !== String(form.primarySector));
  const contributingSdgChoices = (sdgs || []).filter((s) => String(s.number) !== String(form.primary_sdg));

  return (
    <div className="view" style={{ maxWidth: 880 }}>
      <div className="view-header">
        <div className="view-eyebrow">Assistant d'enregistrement · SF-1</div>
        <h1 className="view-title">Nouveau projet</h1>
        <p className="view-lead">
          Etape Concept Note. L'assistant n'exige que le sous-ensemble minimal correspondant a
          cette etape (gating progressif) — les champs de classification complets seront requis
          au franchissement du gate BED Approved.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card card-flush mb-3">
          <div className="card-header">
            <div>
              <h2 className="card-title">Identite de base</h2>
              <div className="card-sub">Nom, perimetre geographique</div>
            </div>
            <span className="badge badge-lime">Requis</span>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label" htmlFor="name">
                Nom du projet <span className="req">*</span>
              </label>
              <input
                id="name"
                className="field-input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Livestock &amp; Livelihood Development"
                required
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="countries">
                Pays <span className="req">*</span>
              </label>
              <select
                id="countries"
                className="field-select field-multi"
                multiple
                value={form.countryIds.map(String)}
                onChange={(e) => handleMulti("countryIds", e)}
                required
              >
                {countries?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="field-help">
                Multi-pays autorise (Ctrl/Cmd + clic). Le budget reste au niveau projet et n'est
                jamais ventile par pays.
              </span>
            </div>

            {selectedCountries.length > 1 && (
              <div className="field">
                <label className="field-label" htmlFor="lead">
                  Pays chef de file <span className="req">*</span>
                </label>
                <select
                  id="lead"
                  className="field-select"
                  name="leadCountryId"
                  value={form.leadCountryId}
                  onChange={handleChange}
                  required
                >
                  {selectedCountries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="field-help">
                  Sert a l'affichage et au code projet uniquement, pas a la repartition financiere.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="card card-flush mb-3">
          <div className="card-header">
            <div>
              <h2 className="card-title">Alignement strategique</h2>
              <div className="card-sub">Secteurs et objectifs de developpement durable</div>
            </div>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="primarySector">
                  Secteur primaire <span className="req">*</span>
                </label>
                <select
                  id="primarySector"
                  className="field-select"
                  name="primarySector"
                  value={form.primarySector}
                  onChange={handleChange}
                  required
                >
                  <option value="">Selectionner</option>
                  {sectors?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="primarySdg">
                  ODD primaire
                </label>
                <select
                  id="primarySdg"
                  className="field-select"
                  name="primary_sdg"
                  value={form.primary_sdg}
                  onChange={handleChange}
                >
                  <option value="">Selectionner</option>
                  {sdgs?.map((s) => (
                    <option key={s.number} value={s.number}>
                      ODD {s.number} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="contribSectors">
                  Secteurs contributifs
                </label>
                <select
                  id="contribSectors"
                  className="field-select field-multi"
                  multiple
                  value={form.contributingSectorIds.map(String)}
                  onChange={(e) => handleMulti("contributingSectorIds", e)}
                >
                  {contributingSectorChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="contribSdgs">
                  ODD contributifs
                </label>
                <select
                  id="contribSdgs"
                  className="field-select field-multi"
                  multiple
                  value={form.contributingSdgIds.map(String)}
                  onChange={(e) => handleMulti("contributingSdgIds", e)}
                >
                  {contributingSdgChoices.map((s) => (
                    <option key={s.number} value={s.number}>
                      ODD {s.number} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card card-flush mb-4">
          <div className="card-header">
            <div>
              <h2 className="card-title">Financement</h2>
              <div className="card-sub">Enveloppe indicative au stade Concept Note</div>
            </div>
          </div>
          <div className="card-body">
            <div className="field" style={{ maxWidth: 280, marginBottom: 0 }}>
              <label className="field-label" htmlFor="budget">
                Budget indicatif (USD)
              </label>
              <input
                id="budget"
                className="field-input"
                type="number"
                name="budget_amount"
                value={form.budget_amount}
                onChange={handleChange}
                placeholder="22000000"
              />
            </div>
          </div>
        </div>

        {mutation.isError && (
          <div className="field-error mb-3">
            L'enregistrement a echoue : {JSON.stringify(mutation.error.detail)}
          </div>
        )}

        <div className="row">
          <button className="btn btn-primary btn-lg" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Enregistrement..." : "Enregistrer le Concept Note"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

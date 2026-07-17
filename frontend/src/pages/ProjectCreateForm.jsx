import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

const NAVY = "#1B5A8C";
const LIME = "#A4C53F";

const inputStyle = {
  width: "100%",
  padding: "0.5rem",
  marginTop: "0.25rem",
  marginBottom: "1rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "Inter, sans-serif",
};

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

  const { data: countries } = useQuery({
    queryKey: ["countries"],
    queryFn: () => apiFetch("/api/reference/countries/"),
  });
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
  });
  const { data: sdgs } = useQuery({
    queryKey: ["sdgs"],
    queryFn: () => apiFetch("/api/reference/sdgs/"),
  });

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

  function handleContributingSdgsChange(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    setForm({ ...form, contributingSdgIds: selected });
  }

  function handleContributingSectorsChange(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    setForm({ ...form, contributingSectorIds: selected });
  }

  function handleCountriesChange(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    // si le chef de file actuel n'est plus dans la selection, on le reinitialise
    const leadStillValid = selected.includes(Number(form.leadCountryId));
    setForm({
      ...form,
      countryIds: selected,
      leadCountryId: leadStillValid ? form.leadCountryId : (selected[0] || ""),
    });
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
  const contributingSectorChoices = (sectors || []).filter(
    (s) => String(s.id) !== String(form.primarySector)
  );
  const contributingSdgChoices = (sdgs || []).filter(
    (s) => String(s.number) !== String(form.primary_sdg)
  );

  return (
    <div style={{ padding: "2rem", maxWidth: 500, fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ color: NAVY, fontFamily: "Sora, sans-serif" }}>
        Nouveau projet — Concept Note
      </h2>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        SF-1, Etape 1 : sous-ensemble minimal exige au stade Concept Note (POL-1.08).
        Multi-pays autorise (R13) — le budget n'est pas ventile par pays (R20).
      </p>

      <form onSubmit={handleSubmit}>
        <label>
          Nom du projet *
          <input
            style={inputStyle}
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Pays * (Ctrl/Cmd + clic pour en selectionner plusieurs)
          <select
            style={{ ...inputStyle, height: "6rem" }}
            multiple
            value={form.countryIds.map(String)}
            onChange={handleCountriesChange}
            required
          >
            {countries?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {selectedCountries.length > 1 && (
          <label>
            Pays chef de file *
            <select
              style={inputStyle}
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
          </label>
        )}

        <label>
          Secteur primaire *
          <select
            style={inputStyle}
            name="primarySector"
            value={form.primarySector}
            onChange={handleChange}
            required
          >
            <option value="">-- Selectionner --</option>
            {sectors?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Secteurs contributifs (optionnel, Ctrl/Cmd + clic pour plusieurs)
          <select
            style={{ ...inputStyle, height: "6rem" }}
            multiple
            value={form.contributingSectorIds.map(String)}
            onChange={handleContributingSectorsChange}
          >
            {contributingSectorChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Budget indicatif (USD)
          <input
            style={inputStyle}
            type="number"
            name="budget_amount"
            value={form.budget_amount}
            onChange={handleChange}
          />
        </label>

        <label>
          ODD primaire
          <select style={inputStyle} name="primary_sdg" value={form.primary_sdg} onChange={handleChange}>
            <option value="">-- Selectionner --</option>
            {sdgs?.map((s) => (
              <option key={s.number} value={s.number}>
                ODD {s.number} - {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          ODD contributifs (optionnel, Ctrl/Cmd + clic pour plusieurs)
          <select
            style={{ ...inputStyle, height: "6rem" }}
            multiple
            value={form.contributingSdgIds.map(String)}
            onChange={handleContributingSdgsChange}
          >
            {contributingSdgChoices.map((s) => (
              <option key={s.number} value={s.number}>
                ODD {s.number} - {s.name}
              </option>
            ))}
          </select>
        </label>

        {mutation.isError && (
          <p style={{ color: "crimson" }}>
            Erreur : {JSON.stringify(mutation.error.detail)}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              background: LIME,
              color: NAVY,
              border: "none",
              borderRadius: 6,
              padding: "0.6rem 1.2rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {mutation.isPending ? "Creation..." : "Creer le projet"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              color: NAVY,
              border: `1px solid ${NAVY}`,
              borderRadius: 6,
              padding: "0.6rem 1.2rem",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

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
    country: "",
    sector: "",
    budget_amount: "",
    primary_sdg: "",
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

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      name: form.name,
      country: Number(form.country),
      sector: Number(form.sector),
      budget_amount: form.budget_amount || null,
      primary_sdg: form.primary_sdg ? Number(form.primary_sdg) : null,
    });
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 500, fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ color: NAVY, fontFamily: "Sora, sans-serif" }}>
        Nouveau projet — Concept Note
      </h2>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        SF-1, Etape 1 : sous-ensemble minimal exige au stade Concept Note (POL-1.08).
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
          Pays *
          <select style={inputStyle} name="country" value={form.country} onChange={handleChange} required>
            <option value="">-- Selectionner --</option>
            {countries?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Secteur *
          <select style={inputStyle} name="sector" value={form.sector} onChange={handleChange} required>
            <option value="">-- Selectionner --</option>
            {sectors?.map((s) => (
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

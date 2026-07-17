import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Modal from "../components/Modal.jsx";

/* ------------------------------------------------------------------
   Configuration declarative des referentiels.
   Chaque onglet decrit son endpoint, ses colonnes et son formulaire —
   le rendu et le CRUD sont generiques.
   ------------------------------------------------------------------ */
const TABS = [
  {
    key: "countries",
    label: "Pays",
    url: "/api/reference/countries/",
    singular: "un pays",
    sub: "Referentiel GADM Admin 0 · rattachement aux hubs regionaux",
    layout: "table",
    fields: [
      { name: "name", label: "Nom du pays", type: "text", required: true },
      { name: "iso2", label: "Code ISO2", type: "text", required: true, maxLength: 2,
        help: "Deux lettres. Determine le drapeau affiche." },
      { name: "iso3", label: "Code ISO3", type: "text", required: true, maxLength: 3 },
      { name: "hub", label: "Hub regional", type: "select", optionsKey: "hubs" },
      { name: "is_fragile", label: "Contexte de fragilite (FCS)", type: "checkbox" },
    ],
  },
  {
    key: "hubs",
    label: "Hubs regionaux",
    url: "/api/reference/hubs/",
    singular: "un hub",
    sub: "Antennes regionales et pays rattaches",
    layout: "hubs",
    fields: [
      { name: "name", label: "Nom du hub", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, help: "Identifiant court, ex. dakar." },
      { name: "city", label: "Ville d'implantation", type: "text" },
      { name: "color", label: "Couleur d'identification", type: "color" },
    ],
  },
  {
    key: "donors",
    label: "Bailleurs",
    url: "/api/reference/donors/",
    singular: "un bailleur",
    sub: "Les 6 contributeurs du LLF2",
    layout: "donors",
    fields: [
      { name: "short_name", label: "Sigle", type: "text", required: true },
      { name: "name", label: "Denomination complete", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "donor_type", label: "Type", type: "select", options: [
        ["bilateral", "Bilateral"],
        ["multilateral", "Multilateral"],
        ["foundation", "Fondation"],
        ["humanitarian", "Humanitaire"],
      ] },
      { name: "origin_iso2", label: "Pays d'origine (ISO2)", type: "text", maxLength: 2,
        help: "Laisser vide pour une institution multilaterale — elle n'a pas de drapeau national." },
      { name: "color", label: "Couleur institutionnelle", type: "color" },
      { name: "committed_amount_usd", label: "Engagement (USD)", type: "number" },
    ],
  },
  {
    key: "agencies",
    label: "Agences d'implementation",
    url: "/api/reference/agencies/",
    singular: "une agence",
    sub: "Ministeres, agences nationales, agences ONU et ONG d'execution",
    layout: "table",
    fields: [
      { name: "name", label: "Nom de l'agence", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "agency_type", label: "Type", type: "select", required: true, options: [
        ["government", "Gouvernement"],
        ["national_agency", "Agence nationale"],
        ["un_agency", "Agence ONU"],
        ["ngo", "ONG"],
        ["private", "Secteur prive"],
      ] },
      { name: "country", label: "Pays", type: "select", optionsKey: "countries",
        help: "Laisser vide pour une agence internationale (ONU, ONG multi-pays)." },
    ],
  },
  {
    key: "sectors",
    label: "Secteurs",
    url: "/api/reference/sectors/",
    singular: "un secteur",
    sub: "Piliers LLF2 et themes transversaux",
    layout: "table",
    fields: [
      { name: "name", label: "Nom du secteur", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
    ],
  },
  {
    key: "sdgs",
    label: "ODD",
    url: "/api/reference/sdgs/",
    singular: "un ODD",
    sub: "Objectifs de developpement durable · Nations Unies",
    layout: "table",
    idField: "number",
    fields: [
      { name: "number", label: "Numero", type: "number", required: true },
      { name: "name", label: "Intitule", type: "text", required: true },
    ],
  },
];

function Flag({ value }) {
  if (!value) return <span className="flag-none">—</span>;
  return <span className="flag">{value}</span>;
}

/* ------------------------------------------------------------------
   Rendus specifiques par onglet
   ------------------------------------------------------------------ */
function CountriesTable({ rows, canEdit, onEdit }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 50 }}>Drapeau</th>
          <th style={{ width: 70 }}>ISO3</th>
          <th>Pays</th>
          <th>Hub regional</th>
          <th style={{ width: 90 }}>Fragilite</th>
          {canEdit && <th style={{ width: 70 }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><Flag value={r.flag} /></td>
            <td className="text-mono text-xs">{r.iso3}</td>
            <td style={{ fontWeight: 500 }}>{r.name}</td>
            <td>
              {r.hub_name ? (
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%",
                    background: r.hub_color || "var(--subtle)", flexShrink: 0 }} />
                  {r.hub_name}
                </span>
              ) : (
                <span className="text-muted text-xs">Non rattache</span>
              )}
            </td>
            <td>{r.is_fragile ? <span className="badge badge-rose">FCS</span> : "—"}</td>
            {canEdit && (
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>Editer</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HubCards({ rows, canEdit, onEdit }) {
  return (
    <div className="grid grid-2" style={{ padding: "var(--s-4)" }}>
      {rows.map((h) => (
        <div className="hub-card" key={h.id} style={{ "--hub-color": h.color || "var(--lime)" }}>
          <div className="row row-between" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="hub-name">{h.name}</div>
              <div className="hub-city">{h.city || "Ville non renseignee"}</div>
            </div>
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(h)}>Editer</button>
            )}
          </div>

          <div className="country-chips">
            {h.countries.length === 0 && (
              <span className="text-muted text-xs">Aucun pays rattache.</span>
            )}
            {h.countries.map((c) => (
              <span className="country-chip" key={c.id}>
                <span className="flag" style={{ fontSize: 13 }}>{c.flag}</span>
                {c.name}
              </span>
            ))}
          </div>

          <div className="hub-meta">
            <span>{h.country_count} pays</span>
            <span className="text-mono">{h.code}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DonorCards({ rows, canEdit, onEdit }) {
  return (
    <div className="grid grid-2" style={{ padding: "var(--s-4)" }}>
      {rows.map((d) => (
        <div className="donor-card" key={d.id}>
          <div className="donor-mark" style={{ "--donor-color": d.color || "var(--ink)" }}>
            {d.short_name || d.code}
          </div>
          <div className="donor-body">
            <div className="donor-sigle">
              {d.short_name}
              {d.flag ? (
                <span className="flag" style={{ fontSize: 15 }}>{d.flag}</span>
              ) : (
                <span className="badge text-xs">Multilateral</span>
              )}
            </div>
            <div className="donor-name" title={d.name}>{d.name}</div>
          </div>
          <div>
            <div className="donor-amount">
              {d.committed_amount_usd
                ? `${(Number(d.committed_amount_usd) / 1_000_000).toFixed(0)}M`
                : "—"}
            </div>
            {canEdit && (
              <button className="btn btn-ghost btn-sm mt-1" onClick={() => onEdit(d)}>Editer</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgenciesTable({ rows, canEdit, onEdit }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 50 }}>Drapeau</th>
          <th>Agence</th>
          <th style={{ width: 160 }}>Type</th>
          <th style={{ width: 160 }}>Pays</th>
          {canEdit && <th style={{ width: 70 }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td><Flag value={a.flag} /></td>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td><span className="badge">{a.agency_type_display}</span></td>
            <td>{a.country_name || <span className="text-muted text-xs">International</span>}</td>
            {canEdit && (
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(a)}>Editer</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SimpleTable({ rows, tab, canEdit, onEdit }) {
  const idField = tab.idField || "id";
  const cols = tab.key === "sdgs"
    ? [{ f: "number", l: "N°", mono: true, w: 60 }, { f: "name", l: "Objectif", strong: true }]
    : [{ f: "code", l: "Code", mono: true, w: 220 }, { f: "name", l: "Nom", strong: true }];

  return (
    <table className="table">
      <thead>
        <tr>
          {cols.map((c) => <th key={c.f} style={c.w ? { width: c.w } : undefined}>{c.l}</th>)}
          {canEdit && <th style={{ width: 70 }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[idField]}>
            {cols.map((c) => (
              <td key={c.f} className={c.mono ? "text-mono text-xs" : undefined}
                  style={c.strong ? { fontWeight: 500 } : undefined}>
                {r[c.f]}
              </td>
            ))}
            {canEdit && (
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>Editer</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------
   Ecran principal
   ------------------------------------------------------------------ */
export default function MasterData({ canEdit }) {
  const [tabKey, setTabKey] = useState("countries");
  const [editing, setEditing] = useState(null); // null | {} (creation) | {...row} (edition)
  const queryClient = useQueryClient();
  const tab = TABS.find((t) => t.key === tabKey);

  const { data, isLoading } = useQuery({
    queryKey: ["ref", tabKey],
    queryFn: () => apiFetch(tab.url),
  });

  // Listes deroulantes partagees par les formulaires
  const { data: hubs } = useQuery({
    queryKey: ["ref", "hubs"],
    queryFn: () => apiFetch("/api/reference/hubs/"),
  });
  const { data: countries } = useQuery({
    queryKey: ["ref", "countries"],
    queryFn: () => apiFetch("/api/reference/countries/"),
  });

  const optionSources = {
    hubs: (hubs || []).map((h) => [h.id, h.name]),
    countries: (countries || []).map((c) => [c.id, `${c.flag} ${c.name}`]),
  };

  const idField = tab.idField || "id";
  const isCreate = editing && editing[idField] === undefined;

  const mutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(isCreate ? tab.url : `${tab.url}${editing[idField]}/`, {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      // Les hubs affichent leurs pays et les pays affichent leur hub :
      // toute ecriture sur l'un peut invalider l'autre.
      queryClient.invalidateQueries({ queryKey: ["ref"] });
      setEditing(null);
    },
  });

  function submitForm(e) {
    e.preventDefault();
    const payload = {};
    for (const f of tab.fields) {
      let v = editing[f.name];
      if (f.type === "checkbox") v = Boolean(v);
      else if (v === "" || v === undefined) v = f.type === "select" || f.type === "number" ? null : "";
      payload[f.name] = v;
    }
    mutation.mutate(payload);
  }

  const rows = data || [];

  return (
    <div className="view">
      <div className="row row-between mb-4" style={{ alignItems: "flex-end" }}>
        <div className="view-header" style={{ marginBottom: 0 }}>
          <div className="view-eyebrow">Referentiels</div>
          <h1 className="view-title">Donnees de base</h1>
          <p className="view-lead">
            Elements reutilises par tous les projets du portefeuille. La modification est
            reservee aux roles portant la gouvernance des classifications.
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + Ajouter {tab.singular}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="card mb-3" style={{ background: "var(--lime-pale)", borderColor: "var(--lime-soft)" }}>
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <span className="badge badge-lime">Lecture seule</span>
            <span className="text-sm text-muted">
              Votre role ne porte pas la gouvernance des referentiels. Ces donnees sont
              maintenues par le LLFMU aRBM Specialist ou le Data &amp; Digital Analyst.
            </span>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tabKey === t.key ? " active" : ""}`}
            onClick={() => setTabKey(t.key)}
          >
            {t.label}
            {tabKey === t.key && data && <span className="tab-count">{data.length}</span>}
          </button>
        ))}
      </div>

      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title">{tab.label}</h2>
            <div className="card-sub">{tab.sub}</div>
          </div>
          {data && <span className="badge badge-lime">{data.length} entrees</span>}
        </div>

        {isLoading && (
          <div className="loading-wrap" style={{ minHeight: 160 }}>
            <span className="spinner" /> Chargement...
          </div>
        )}

        {data && rows.length === 0 && (
          <div className="empty">
            <div className="empty-title">Aucune entree</div>
            <p className="text-sm">Ce referentiel est vide.</p>
          </div>
        )}

        {data && rows.length > 0 && (
          <>
            {tab.key === "countries" && <CountriesTable rows={rows} canEdit={canEdit} onEdit={setEditing} />}
            {tab.key === "hubs" && <HubCards rows={rows} canEdit={canEdit} onEdit={setEditing} />}
            {tab.key === "donors" && <DonorCards rows={rows} canEdit={canEdit} onEdit={setEditing} />}
            {tab.key === "agencies" && <AgenciesTable rows={rows} canEdit={canEdit} onEdit={setEditing} />}
            {(tab.key === "sectors" || tab.key === "sdgs") && (
              <SimpleTable rows={rows} tab={tab} canEdit={canEdit} onEdit={setEditing} />
            )}
          </>
        )}
      </div>

      {tab.key === "hubs" && (
        <p className="text-xs text-muted mt-3">
          Le portefeuille LLF2 compte 8 hubs. Trois d'entre eux (Almaty, Ankara, Jakarta) ne sont
          pas charges : leur composition en pays n'est pas encore documentee.
        </p>
      )}

      {editing && (
        <Modal
          title={isCreate ? `Ajouter ${tab.singular}` : `Editer ${editing.name || tab.singular}`}
          subtitle={tab.sub}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={submitForm} disabled={mutation.isPending}>
                {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </>
          }
        >
          <form onSubmit={submitForm}>
            {tab.fields.map((f) => {
              const value = editing[f.name] ?? "";
              const options = f.optionsKey ? optionSources[f.optionsKey] : f.options;

              if (f.type === "checkbox") {
                return (
                  <div className="field" key={f.name}>
                    <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editing[f.name])}
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.checked })}
                      />
                      <span className="field-label" style={{ margin: 0 }}>{f.label}</span>
                    </label>
                  </div>
                );
              }

              return (
                <div className="field" key={f.name}>
                  <label className="field-label" htmlFor={`f-${f.name}`}>
                    {f.label} {f.required && <span className="req">*</span>}
                  </label>

                  {f.type === "select" ? (
                    <select
                      id={`f-${f.name}`}
                      className="field-select"
                      value={value ?? ""}
                      required={f.required}
                      onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                    >
                      <option value="">— Aucun —</option>
                      {(options || []).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  ) : f.type === "color" ? (
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        id={`f-${f.name}`}
                        type="color"
                        value={value || "#A4C53F"}
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                        style={{ width: 44, height: 36, padding: 2, border: "1px solid var(--rule)",
                                 borderRadius: "var(--r-2)", background: "var(--surface)" }}
                      />
                      <input
                        className="field-input text-mono"
                        value={value}
                        placeholder="#A4C53F"
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                      />
                    </div>
                  ) : (
                    <input
                      id={`f-${f.name}`}
                      className="field-input"
                      type={f.type}
                      value={value}
                      required={f.required}
                      maxLength={f.maxLength}
                      onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                    />
                  )}

                  {f.help && <span className="field-help">{f.help}</span>}
                </div>
              );
            })}

            {mutation.isError && (
              <div className="field-error">
                {Object.entries(mutation.error.detail || {})
                  .map(([k, v]) => `${k} : ${[].concat(v).join(" ")}`)
                  .join(" · ") || "L'enregistrement a echoue."}
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

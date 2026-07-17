import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Modal from "../components/Modal.jsx";
import DataTable from "../components/DataTable.jsx";
import Flag from "../components/Flag.jsx";
import SectorIcon from "../components/SectorIcon.jsx";

const ICON_OPTIONS = [
  ["health", "Sante (croix)"],
  ["agriculture", "Agriculture (epi)"],
  ["infrastructure", "Infrastructure (batiment)"],
  ["gender", "Genre (Venus)"],
  ["climate", "Climat (feuille)"],
  ["water", "Eau (goutte)"],
  ["education", "Education (livre)"],
  ["generic", "Generique (losange)"],
];

const DONOR_TYPES = [
  ["bilateral", "Bilateral"],
  ["multilateral", "Multilateral"],
  ["foundation", "Fondation"],
  ["humanitarian", "Humanitaire"],
];

const AGENCY_TYPES = [
  ["government", "Gouvernement"],
  ["national_agency", "Agence nationale"],
  ["un_agency", "Agence ONU"],
  ["ngo", "ONG"],
  ["private", "Secteur prive"],
];

const TABS = [
  {
    key: "countries",
    label: "Pays",
    url: "/api/reference/countries/",
    singular: "un pays",
    sub: "Referentiel GADM Admin 0 · rattachement aux hubs regionaux",
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
    fields: [
      { name: "short_name", label: "Sigle", type: "text", required: true },
      { name: "name", label: "Denomination complete", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "donor_type", label: "Type", type: "select", options: DONOR_TYPES },
      { name: "origin_iso2", label: "Pays d'origine (ISO2)", type: "text", maxLength: 2,
        help: "Laisser vide pour une institution multilaterale — elle n'a pas de drapeau national." },
      { name: "logo_url", label: "URL du logo officiel", type: "url",
        help: "Lien vers le logo. A defaut, un monogramme colore est affiche." },
      { name: "color", label: "Couleur institutionnelle", type: "color",
        help: "Utilisee pour le monogramme de repli." },
      { name: "committed_amount_usd", label: "Engagement (USD)", type: "number",
        help: "A saisir depuis les chiffres officiels de la LLF MU." },
    ],
  },
  {
    key: "agencies",
    label: "Agences d'implementation",
    url: "/api/reference/agencies/",
    singular: "une agence",
    sub: "Ministeres, agences nationales, agences ONU et ONG d'execution",
    fields: [
      { name: "name", label: "Nom de l'agence", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "agency_type", label: "Type", type: "select", required: true, options: AGENCY_TYPES },
      { name: "country", label: "Pays", type: "select", optionsKey: "countries",
        help: "Laisser vide pour une agence internationale (ONU, ONG multi-pays)." },
      { name: "logo_url", label: "URL du logo", type: "url" },
    ],
  },
  {
    key: "sectors",
    label: "Secteurs",
    url: "/api/reference/sectors/",
    singular: "un secteur",
    sub: "Piliers LLF2 et themes transversaux",
    fields: [
      { name: "name", label: "Nom du secteur", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "icon", label: "Pictogramme", type: "select", options: ICON_OPTIONS },
      { name: "color", label: "Couleur", type: "color" },
      { name: "parent", label: "Secteur parent", type: "select", optionsKey: "sectors",
        help: "Laisser vide pour un secteur de premier niveau." },
    ],
  },
  {
    key: "sdgs",
    label: "ODD",
    url: "/api/reference/sdgs/",
    singular: "un ODD",
    sub: "Objectifs de developpement durable · Nations Unies",
    idField: "number",
    fields: [
      { name: "number", label: "Numero", type: "number", required: true },
      { name: "name", label: "Intitule", type: "text", required: true },
      { name: "color", label: "Couleur officielle ONU", type: "color" },
    ],
  },
];

function Monogram({ label, color, size = "sm" }) {
  return (
    <span className={size === "sm" ? "mono-sm" : "donor-mark"} style={{ "--mono-color": color || "var(--ink)", "--donor-color": color || "var(--ink)" }}>
      {label}
    </span>
  );
}

function LogoOrMono({ url, label, color, small }) {
  if (url) {
    return <img className={small ? "logo-img-sm" : "logo-img"} src={url} alt="" loading="lazy" />;
  }
  return <Monogram label={label} color={color} size={small ? "sm" : "lg"} />;
}

export default function MasterData({ canEdit }) {
  const [tabKey, setTabKey] = useState("countries");
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();
  const tab = TABS.find((t) => t.key === tabKey);

  const { data, isLoading } = useQuery({
    queryKey: ["ref", tabKey],
    queryFn: () => apiFetch(tab.url),
  });
  const { data: hubs } = useQuery({ queryKey: ["ref", "hubs"], queryFn: () => apiFetch("/api/reference/hubs/") });
  const { data: countries } = useQuery({ queryKey: ["ref", "countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: sectors } = useQuery({ queryKey: ["ref", "sectors"], queryFn: () => apiFetch("/api/reference/sectors/") });

  const optionSources = {
    hubs: (hubs || []).map((h) => [h.id, h.name]),
    countries: (countries || []).map((c) => [c.id, c.name]),
    sectors: (sectors || []).filter((s) => !s.parent).map((s) => [s.id, s.name]),
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
      else if (v === "" || v === undefined) v = ["select", "number"].includes(f.type) ? null : "";
      payload[f.name] = v;
    }
    mutation.mutate(payload);
  }

  const editCol = canEdit
    ? [{
        key: "_edit", label: "", width: 70,
        render: (r) => (
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>
            Editer
          </button>
        ),
      }]
    : [];

  const rows = data || [];

  const TABLES = {
    countries: {
      searchKeys: ["name", "iso2", "iso3", "hub_name"],
      filters: [
        { key: "hub_name", label: "Hub", options: (hubs || []).map((h) => [h.name, h.name]) },
      ],
      columns: [
        { key: "flag", label: "", width: 44, render: (r) => <Flag iso2={r.iso2} title={r.name} /> },
        { key: "iso3", label: "ISO3", width: 70, cellClass: "text-mono text-xs", sortable: true },
        { key: "name", label: "Pays", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        {
          key: "hub_name", label: "Hub regional", sortable: true,
          render: (r) => r.hub_name ? (
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.hub_color || "var(--subtle)", flexShrink: 0 }} />
              {r.hub_name}
            </span>
          ) : <span className="text-muted text-xs">Non rattache</span>,
        },
        { key: "is_fragile", label: "Fragilite", width: 90, render: (r) => r.is_fragile ? <span className="badge badge-rose">FCS</span> : "—" },
        ...editCol,
      ],
    },
    donors: {
      searchKeys: ["name", "short_name", "code"],
      filters: [{ key: "donor_type", label: "Type", options: DONOR_TYPES }],
      columns: [
        { key: "logo", label: "", width: 48, render: (r) => <LogoOrMono url={r.logo_url} label={r.short_name || r.code} color={r.color} small /> },
        {
          key: "short_name", label: "Sigle", width: 130, sortable: true,
          render: (r) => (
            <span className="row" style={{ gap: 6 }}>
              <strong style={{ fontWeight: 600 }}>{r.short_name}</strong>
              {r.origin_iso2 ? <Flag iso2={r.origin_iso2} size={16} /> : null}
            </span>
          ),
        },
        { key: "name", label: "Denomination", sortable: true, cellClass: "text-muted" },
        { key: "donor_type_display", label: "Type", width: 130, sortable: true, render: (r) => <span className="badge">{r.donor_type_display}</span> },
        {
          key: "committed_amount_usd", label: "Engagement", width: 120,
          cellClass: "text-mono text-xs", sortable: true,
          sortValue: (r) => Number(r.committed_amount_usd || 0),
          render: (r) => r.committed_amount_usd
            ? `${(Number(r.committed_amount_usd) / 1_000_000).toFixed(0)}M USD`
            : <span className="text-muted">Non renseigne</span>,
        },
        ...editCol,
      ],
    },
    agencies: {
      searchKeys: ["name", "code", "country_name"],
      filters: [{ key: "agency_type", label: "Type", options: AGENCY_TYPES }],
      columns: [
        { key: "logo", label: "", width: 44, render: (r) => <LogoOrMono url={r.logo_url} label={r.name.slice(0, 2).toUpperCase()} color="var(--ink-soft)" small /> },
        { key: "name", label: "Agence", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        { key: "agency_type_display", label: "Type", width: 160, sortable: true, render: (r) => <span className="badge">{r.agency_type_display}</span> },
        {
          key: "country_name", label: "Pays", width: 180, sortable: true,
          render: (r) => r.country_name ? (
            <span className="row" style={{ gap: 7 }}>
              <Flag iso2={r.country_iso2} size={16} />
              {r.country_name}
            </span>
          ) : <span className="text-muted text-xs">International</span>,
        },
        ...editCol,
      ],
    },
    sectors: {
      searchKeys: ["name", "code"],
      columns: [
        { key: "icon", label: "", width: 52, render: (r) => <SectorIcon name={r.icon} color={r.color} /> },
        { key: "name", label: "Secteur", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        { key: "parent_name", label: "Rattache a", width: 200, render: (r) => r.parent_name || <span className="text-muted text-xs">Premier niveau</span> },
        { key: "code", label: "Code", width: 200, cellClass: "text-mono text-xs", sortable: true },
        ...editCol,
      ],
    },
    sdgs: {
      searchKeys: ["name"],
      pageSize: 20,
      columns: [
        {
          key: "number", label: "", width: 52, sortable: true,
          render: (r) => <span className="sdg-tile" style={{ "--sdg-color": r.color }}>{String(r.number).padStart(2, "0")}</span>,
        },
        { key: "name", label: "Objectif de developpement durable", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        ...editCol,
      ],
    },
  };

  const cfg = TABLES[tabKey];

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
          <button key={t.key} className={`tab${tabKey === t.key ? " active" : ""}`} onClick={() => setTabKey(t.key)}>
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
        </div>

        {isLoading && (
          <div className="loading-wrap" style={{ minHeight: 160 }}>
            <span className="spinner" /> Chargement...
          </div>
        )}

        {data && tab.layout === "hubs" && (
          <div className="grid grid-2" style={{ padding: "var(--s-4)" }}>
            {rows.map((h) => (
              <div className="hub-card" key={h.id} style={{ "--hub-color": h.color || "var(--lime)" }}>
                <div className="row row-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="hub-name">{h.name}</div>
                    <div className="hub-city">{h.city || "Ville non renseignee"}</div>
                  </div>
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(h)}>Editer</button>}
                </div>
                <div className="country-chips">
                  {h.countries.length === 0 && <span className="text-muted text-xs">Aucun pays rattache.</span>}
                  {h.countries.map((c) => (
                    <span className="country-chip" key={c.id}>
                      <Flag iso2={c.iso2} size={13} title={c.name} />
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
        )}

        {data && tab.layout !== "hubs" && cfg && (
          <DataTable
            rows={rows}
            columns={cfg.columns}
            searchKeys={cfg.searchKeys}
            filters={cfg.filters}
            pageSize={cfg.pageSize || 15}
            rowKey={(r) => r[idField]}
            emptyLabel="Ce referentiel est vide."
          />
        )}
      </div>

      {tabKey === "hubs" && (
        <p className="text-xs text-muted mt-3">
          Le portefeuille LLF2 compte 8 hubs. Trois d'entre eux (Almaty, Ankara, Jakarta) ne sont
          pas charges : leur composition en pays n'est pas encore documentee.
        </p>
      )}

      {tabKey === "donors" && (
        <p className="text-xs text-muted mt-3">
          Les engagements ne sont pas pre-remplis : les chiffres publies varient selon la phase
          (LLF1 / LLF2) et melent subventions, prets concessionnels et waqf. Ils doivent etre
          saisis depuis les donnees officielles de la LLF MU.
        </p>
      )}

      {tabKey === "sdgs" && (
        <p className="text-xs text-muted mt-3">
          Les tuiles reprennent les couleurs officielles des Nations Unies. Les pictogrammes
          officiels des ODD sont des marques de l'ONU soumises a des regles d'usage : ils ne
          sont pas reproduits ici.
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
                      <input type="checkbox" checked={Boolean(editing[f.name])}
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.checked })} />
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
                    <select id={`f-${f.name}`} className="field-select" value={value ?? ""} required={f.required}
                      onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}>
                      <option value="">— Aucun —</option>
                      {(options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : f.type === "color" ? (
                    <div className="row" style={{ gap: 8 }}>
                      <input id={`f-${f.name}`} type="color" value={value || "#A4C53F"}
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                        style={{ width: 44, height: 36, padding: 2, border: "1px solid var(--rule)", borderRadius: "var(--r-2)", background: "var(--surface)" }} />
                      <input className="field-input text-mono" value={value} placeholder="#A4C53F"
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })} />
                    </div>
                  ) : (
                    <input id={`f-${f.name}`} className="field-input" type={f.type} value={value}
                      required={f.required} maxLength={f.maxLength}
                      onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })} />
                  )}

                  {f.help && <span className="field-help">{f.help}</span>}
                </div>
              );
            })}

            {mutation.isError && (
              <div className="field-error">
                {Object.entries(mutation.error.detail || {}).map(([k, v]) => `${k} : ${[].concat(v).join(" ")}`).join(" · ")
                  || "L'enregistrement a echoue."}
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

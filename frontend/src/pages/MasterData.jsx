import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Modal from "../components/Modal.jsx";
import DataTable from "../components/DataTable.jsx";
import Flag from "../components/Flag.jsx";
import SectorIcon from "../components/SectorIcon.jsx";
import LogoField from "../components/LogoField.jsx";
import Select from "../components/Select";
import {
  IconEdit,
  IconPlus,
  IconDeactivate,
  IconReactivate,
  IconWarning,
} from "../components/ActionIcons.jsx";

const ICON_OPTIONS = [
  ["health", "Health — cross"],
  ["hospital", "Health — facility"],
  ["maternal", "Health — maternal & child"],
  ["nutrition", "Health — nutrition"],
  ["vaccine", "Health — vaccination"],
  ["agriculture", "Agriculture — crops"],
  ["livestock", "Agriculture — livestock"],
  ["fishery", "Agriculture — fishery"],
  ["irrigation", "Agriculture — irrigation"],
  ["forestry", "Agriculture — forestry"],
  ["infrastructure", "Infrastructure — building"],
  ["water", "Infrastructure — water"],
  ["sanitation", "Infrastructure — sanitation"],
  ["energy", "Infrastructure — energy"],
  ["transport", "Infrastructure — transport"],
  ["digital", "Infrastructure — digital"],
  ["gender", "Transversal — gender"],
  ["climate", "Transversal — climate"],
  ["education", "Transversal — education"],
  ["employment", "Transversal — employment"],
  ["governance", "Cross-cutting — governance"],
  ["fragility", "Cross-cutting — fragility"],
  ["generic", "Generic — diamond"],
];

const DONOR_TYPES = [
  ["bilateral", "Bilateral"],
  ["multilateral", "Multilateral"],
  ["foundation", "Foundation"],
  ["humanitarian", "Humanitaire"],
];

const AGENCY_TYPES = [
  ["government", "Government"],
  ["national_agency", "Agence nationale"],
  ["un_agency", "Agence ONU"],
  ["ngo", "ONG"],
  ["private", "Private Sector"],
];

const STATUS_FILTER = {
  key: "is_active",
  label: "Status",
  options: [["true", "Active"], ["false", "Inactive"]],
};

const LOGO_HELP =
  "PNG, JPEG ou WebP, 2 Mo maximum. Le SVG est refuse : il peut embarquer du " +
  "code executable. Laisser vide affiche un monogramme colore.";

const TABS = [
  {
    key: "countries",
    label: "Countries",
    url: "/api/reference/countries/",
    singular: "country",
    sub: "GADM Admin 0 reference · assignment to regional hubs",
    fields: [
      { name: "name", label: "Country Name", type: "text", required: true },
      { name: "iso2", label: "ISO2 Code", type: "text", required: true, maxLength: 2,
        help: "Deux lettres. Determine le drapeau affiche." },
      { name: "iso3", label: "ISO3 Code", type: "text", required: true, maxLength: 3 },
      { name: "hub", label: "Regional Hub", type: "select", optionsKey: "hubs" },
      { name: "is_fragile", label: "Fragility Context (FCS)", type: "checkbox" },
    ],
  },
  {
    key: "hubs",
    label: "Regional Hubs",
    url: "/api/reference/hubs/",
    singular: "hub",
    sub: "Regional offices and linked countries",
    layout: "hubs",
    fields: [
      { name: "name", label: "Hub Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, help: "Short identifier, e.g. dakar." },
      { name: "city", label: "Host City", type: "text" },
      { name: "color", label: "Identification Color", type: "color" },
    ],
  },
  {
    key: "donors",
    label: "Donors",
    url: "/api/reference/donors/",
    singular: "donor",
    sub: "Les 6 contributeurs du LLF2",
    fields: [
      { name: "short_name", label: "Short Name", type: "text", required: true },
      { name: "name", label: "Full Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: false, help: "Optional — auto-generated from name if left empty." },
      { name: "donor_type", label: "Type", type: "select", options: DONOR_TYPES },
      { name: "origin_iso2", label: "Country of Origin (ISO2)", type: "text", maxLength: 2,
        help: "Leave empty for multilateral institutions — they have no national flag." },
      { name: "logo_url", label: "Logo", type: "logo", help: LOGO_HELP },
      { name: "color", label: "Institutional Color", type: "color",
        help: "Utilisee pour le monogramme de repli." },
      { name: "committed_amount_usd", label: "Commitment (USD)", type: "number",
        help: "A saisir depuis les chiffres officiels de la LLF MU." },
    ],
  },
  {
    key: "agencies",
    label: "Implementing Agencies",
    url: "/api/reference/agencies/",
    singular: "agency",
    sub: "Ministeres, agences nationales, agences ONU et ONG d'execution",
    fields: [
      { name: "name", label: "Agency Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: false, help: "Optional — auto-generated from name if left empty." },
      { name: "agency_type", label: "Type", type: "select", required: true, options: AGENCY_TYPES },
      { name: "country", label: "Countries", type: "select", optionsKey: "countries",
        help: "Leave empty for an international agency (UN, multi-country NGO)." },
      { name: "logo_url", label: "Logo", type: "logo", help: LOGO_HELP },
    ],
  },
  {
    key: "sectors",
    label: "Sectors",
    url: "/api/reference/sectors/",
    singular: "sector",
    sub: "Piliers LLF2 et themes transversaux",
    fields: [
      { name: "name", label: "Sector Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: false, help: "Optional — auto-generated from name if left empty." },
      { name: "icon", label: "Pictogramme", type: "icon-select", options: ICON_OPTIONS },
      { name: "color", label: "Color", type: "color" },
      { name: "parent", label: "Parent Sector", type: "select", optionsKey: "sectors",
        help: "Leave empty for a top-level sector." },
    ],
  },
  {
    key: "sdgs",
    label: "SDGs",
    url: "/api/reference/sdgs/",
    singular: "SDG",
    sub: "Sustainable Development Goals · United Nations",
    idField: "number",
    // Closed reference : les 17 ODD sont fixes par l'ONU. Ni ajout, ni
    // desactivation — seul le libelle est modifiable (traduction).
    closed: true,
    fields: [
      { name: "name", label: "Intitule", type: "text", required: true },
      { name: "color", label: "Couleur officielle ONU", type: "color" },
    ],
  },
];

function Monogram({ label, color }) {
  return (
    <span className="mono-sm" style={{ "--mono-color": color || "var(--ink-soft)" }}>
      {label}
    </span>
  );
}

function LogoOrMono({ url, label, color }) {
  if (url) return <img className="logo-img-sm" src={url} alt="" loading="lazy" />;
  return <Monogram label={label} color={color} />;
}

export default function MasterData({ canEdit }) {
  const [tabKey, setTabKey] = useState("countries");
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null); // { row, next: bool }
  const queryClient = useQueryClient();
  const tab = TABS.find((t) => t.key === tabKey);

  const { data, isLoading } = useQuery({ queryKey: ["ref", tabKey], queryFn: () => apiFetch(tab.url) });
  const { data: hubs } = useQuery({ queryKey: ["ref", "hubs"], queryFn: () => apiFetch("/api/reference/hubs/") });
  const { data: countries } = useQuery({ queryKey: ["ref", "countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const { data: sectors } = useQuery({ queryKey: ["ref", "sectors"], queryFn: () => apiFetch("/api/reference/sectors/") });

  const optionSources = {
    hubs: (hubs || []).filter((h) => h.is_active).map((h) => [h.id, h.name]),
    countries: (countries || []).filter((c) => c.is_active).map((c) => [c.id, c.name]),
    sectors: (sectors || []).filter((s) => !s.parent && s.is_active).map((s) => [s.id, s.name]),
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

  // Desactivation : DELETE cote API, que le backend traduit en is_active=false
  // (POL-1.07). Reactivation : simple PATCH.
  const toggleActive = useMutation({
    mutationFn: ({ row, next }) =>
      next
        ? apiFetch(`${tab.url}${row[idField]}/`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: true }),
          })
        : apiFetch(`${tab.url}${row[idField]}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ref"] });
      setConfirming(null);
    },
  });

  function submitForm(e) {
    e.preventDefault();
    const payload = {};
    for (const f of tab.fields) {
      let v = editing[f.name];
      if (f.type === "checkbox") v = Boolean(v);
      else if (v === "" || v === undefined)
        v = ["select", "icon-select", "number"].includes(f.type) ? null : "";
      payload[f.name] = v;
    }
    mutation.mutate(payload);
  }

  function actionsCol() {
    if (!canEdit) return [];
    return [{
      key: "_actions",
      label: "",
      width: tab.closed ? 48 : 82,
      render: (r) => (
        <div className="row-actions">
          <button
            className="btn-square"
            title="Edit"
            aria-label={`Edit ${r.name}`}
            onClick={(e) => { e.stopPropagation(); setEditing(r); }}
          >
            <IconEdit />
          </button>
          {!tab.closed && (
            <button
              className={`btn-square${r.is_active ? " danger" : ""}`}
              title={r.is_active ? "Deactivate" : "Reactivate"}
              aria-label={`${r.is_active ? "Deactivate" : "Reactivate"} ${r.name}`}
              onClick={(e) => { e.stopPropagation(); setConfirming({ row: r, next: !r.is_active }); }}
            >
              {r.is_active ? <IconDeactivate /> : <IconReactivate />}
            </button>
          )}
        </div>
      ),
    }];
  }

  const statusCol = tab.closed
    ? []
    : [{
        key: "is_active",
        label: "Status",
        width: 92,
        render: (r) =>
          r.is_active
            ? <span className="badge badge-lime">Active</span>
            : <span className="badge badge-off">Inactive</span>,
      }];

  const rows = data || [];

  const TABLES = {
    countries: {
      searchKeys: ["name", "iso2", "iso3", "hub_name"],
      filters: [{ key: "hub_name", label: "Hub", options: (hubs || []).map((h) => [h.name, h.name]) }, STATUS_FILTER],
      columns: [
        { key: "flag", label: "", width: 44, render: (r) => <Flag iso2={r.iso2} title={r.name} /> },
        { key: "iso3", label: "ISO3", width: 66, cellClass: "text-mono text-xs", sortable: true },
        { key: "name", label: "Countries", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        {
          key: "hub_name", label: "Regional Hub", sortable: true,
          render: (r) => r.hub_name ? (
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.hub_color || "var(--subtle)", flexShrink: 0 }} />
              {r.hub_name}
            </span>
          ) : <span className="text-muted text-xs">Not linked</span>,
        },
        { key: "is_fragile", label: "Fragility", width: 84, render: (r) => r.is_fragile ? <span className="badge badge-rose">FCS</span> : "—" },
        ...statusCol,
        ...actionsCol(),
      ],
    },
    donors: {
      searchKeys: ["name", "short_name", "code"],
      filters: [{ key: "donor_type", label: "Type", options: DONOR_TYPES }, STATUS_FILTER],
      columns: [
        { key: "logo", label: "", width: 72, render: (r) => <LogoOrMono url={r.logo_url} label={r.short_name || r.code} color={r.color} /> },
        {
          key: "short_name", label: "Short Name", width: 128, sortable: true,
          render: (r) => (
            <span className="row" style={{ gap: 6 }}>
              <strong style={{ fontWeight: 600 }}>{r.short_name}</strong>
              {r.origin_iso2 ? <Flag iso2={r.origin_iso2} size={16} /> : null}
            </span>
          ),
        },
        { key: "name", label: "Denomination", sortable: true, cellClass: "text-muted" },
        { key: "donor_type_display", label: "Type", width: 122, sortable: true, render: (r) => <span className="badge">{r.donor_type_display}</span> },
        {
          key: "committed_amount_usd", label: "Engagement", width: 116,
          cellClass: "text-mono text-xs", sortable: true,
          sortValue: (r) => Number(r.committed_amount_usd || 0),
          render: (r) => r.committed_amount_usd
            ? `${(Number(r.committed_amount_usd) / 1_000_000).toFixed(0)}M USD`
            : <span className="text-muted">Not set</span>,
        },
        ...statusCol,
        ...actionsCol(),
      ],
    },
    agencies: {
      searchKeys: ["name", "code", "country_name"],
      filters: [{ key: "agency_type", label: "Type", options: AGENCY_TYPES }, STATUS_FILTER],
      columns: [
        { key: "logo", label: "", width: 72, render: (r) => <LogoOrMono url={r.logo_url} label={r.name.slice(0, 3).toUpperCase()} color="var(--ink-soft)" /> },
        { key: "name", label: "Agence", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        { key: "agency_type_display", label: "Type", width: 148, sortable: true, render: (r) => <span className="badge">{r.agency_type_display}</span> },
        {
          key: "country_name", label: "Countries", width: 168, sortable: true,
          render: (r) => r.country_name ? (
            <span className="row" style={{ gap: 7 }}>
              <Flag iso2={r.country_iso2} size={16} />
              {r.country_name}
            </span>
          ) : <span className="text-muted text-xs">International</span>,
        },
        ...statusCol,
        ...actionsCol(),
      ],
    },
    sectors: {
      searchKeys: ["name", "code"],
      filters: [STATUS_FILTER],
      columns: [
        { key: "icon", label: "", width: 52, render: (r) => <SectorIcon name={r.icon} color={r.color} /> },
        { key: "name", label: "Sector", sortable: true, render: (r) => <strong style={{ fontWeight: 500 }}>{r.name}</strong> },
        { key: "parent_name", label: "Linked to", width: 184, render: (r) => r.parent_name || <span className="text-muted text-xs">First level</span> },
        { key: "usage_count", label: "Projects", width: 78, cellClass: "text-mono text-xs", sortable: true },
        ...statusCol,
        ...actionsCol(),
      ],
    },
    sdgs: {
      searchKeys: ["name"],
      columns: [
        {
          key: "number", label: "", width: 64, sortable: true,
          render: (r) => (
            <img className="sdg-icon" src={`/logos/sdg/${r.number}.png`} alt={`SDG ${r.number}`} loading="lazy" />
          ),
        },
        {
          key: "name", label: "Objectif de developpement durable", sortable: true,
          render: (r) => (
            <span className="row" style={{ gap: 8 }}>
              <span className="sdg-dot" style={{ background: r.color }} />
              <strong style={{ fontWeight: 500 }}>{r.name}</strong>
            </span>
          ),
        },
        ...actionsCol(),
      ],
    },
  };

  const cfg = TABLES[tabKey];

  return (
    <div className="view">
      <div className="row row-between mb-4" style={{ alignItems: "flex-end" }}>
        <div className="view-header" style={{ marginBottom: 0 }}>
          <div className="view-eyebrow">Reference Data</div>
          <h1 className="view-title">Reference Data</h1>
          <p className="view-lead">
            Elements reused across every portfolio project. Editing is
            restricted to the roles that own classification governance.
          </p>
        </div>
        {canEdit && !tab.closed && (
          <button className="btn btn-primary btn-icon" onClick={() => setEditing({})}>
            <IconPlus size={14} /> Add {tab.singular}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="card mb-3" style={{ background: "var(--lime-pale)", borderColor: "var(--lime-soft)" }}>
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <span className="badge badge-lime">Read only</span>
            <span className="text-sm text-muted">
              Your role does not own reference-data governance. This data is
              maintained by the LLFMU aRBM Specialist or the Data &amp; Digital Analyst.
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
              <div className="hub-card" key={h.id}
                   style={{ "--hub-color": h.color || "var(--lime)", opacity: h.is_active ? 1 : 0.5 }}>
                <div className="row row-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="hub-name">
                      {h.name}
                      {!h.is_active && <span className="badge badge-off" style={{ marginLeft: 8 }}>Inactive</span>}
                    </div>
                    <div className="hub-city">{h.city || "City not set"}</div>
                  </div>
                  {canEdit && (
                    <div className="row-actions">
                      <button className="btn-square" title="Edit" onClick={() => setEditing(h)}>
                        <IconEdit />
                      </button>
                      <button
                        className={`btn-square${h.is_active ? " danger" : ""}`}
                        title={h.is_active ? "Deactivate" : "Reactivate"}
                        onClick={() => setConfirming({ row: h, next: !h.is_active })}
                      >
                        {h.is_active ? <IconDeactivate /> : <IconReactivate />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="country-chips">
                  {h.countries.length === 0 && <span className="text-muted text-xs">No country linked.</span>}
                  {h.countries.map((c) => (
                    <span className="country-chip" key={c.id}>
                      <Flag iso2={c.iso2} size={13} title={c.name} />
                      {c.name}
                    </span>
                  ))}
                </div>
                <div className="hub-meta">
                  <span>{h.country_count} countries · {h.usage_count} projects</span>
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
            defaultFilters={tab.closed ? {} : { is_active: "true" }}
            pageSize={10}
            rowKey={(r) => r[idField]}
            rowClass={(r) => (r.is_active === false ? "row-inactive" : undefined)}
            emptyLabel="Ce referentiel est vide."
          />
        )}
      </div>

      {tabKey === "hubs" && (
        <p className="text-xs text-muted mt-3">
          The LLF2 portfolio has 8 hubs. Three of them (Almaty, Ankara, Jakarta) are not
          loaded yet: their country composition is not documented yet.
        </p>
      )}
      {tabKey === "donors" && (
        <p className="text-xs text-muted mt-3">
          Commitments are not pre-filled: published figures vary by phase
          (LLF1 / LLF2) and mix grants, concessional loans and waqf. They must be
          entered from the official LLF MU data.
        </p>
      )}
      {tabKey === "sdgs" && (
        <p className="text-xs text-muted mt-3">
          Closed reference: the 17 SDGs are defined by the United Nations — no addition,
          desactivation. Seul l'intitule reste modifiable, pour la traduction. Pictogrammes
          officiels ONU (version francaise), utilises conformement aux lignes directrices.
        </p>
      )}

      {/* ---------- Confirmation de desactivation / reactivation ---------- */}
      {confirming && (
        <Modal
          title={confirming.next ? "Reactivate this item?" : "Deactivate this item?"}
          subtitle={confirming.row.name}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
              <button
                className={confirming.next ? "btn btn-primary" : "btn btn-danger"}
                onClick={() => toggleActive.mutate(confirming)}
                disabled={toggleActive.isPending}
              >
                {toggleActive.isPending
                  ? "En cours..."
                  : confirming.next ? "Reactivate" : "Deactivate"}
              </button>
            </>
          }
        >
          {confirming.next ? (
            <p className="text-sm">
              <strong>{confirming.row.name}</strong> redeviendra selectionnable dans les
              formulaires de saisie.
            </p>
          ) : (
            <>
              {confirming.row.usage_count > 0 && (
                <div className="notice notice-warn">
                  <IconWarning size={16} />
                  <span>
                    This item is used by <strong>{confirming.row.usage_count} project
                    {confirming.row.usage_count > 1 ? "s" : ""}</strong>. Those projects
                    keep it: deactivation does not change any existing data.
                  </span>
                </div>
              )}
              <div className="notice notice-info">
                <span>
                  Nothing is permanently deleted — deactivating is reversible.
                  <strong> {confirming.row.name}</strong> disappears from selection lists
                  for new entries, but stays attached to the data that
                  references it. The operation is reversible at any time.
                </span>
              </div>
            </>
          )}
          {toggleActive.isError && (
            <div className="field-error">
              {toggleActive.error?.detail?.detail || "L'operation a echoue."}
            </div>
          )}
        </Modal>
      )}

      {/* ---------- Creation / edition ---------- */}
      {editing && (
        <Modal
          title={isCreate ? `Add ${tab.singular}` : `Edit ${editing.name || tab.singular}`}
          subtitle={tab.sub}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitForm} disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save"}
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

                  {f.type === "logo" ? (
                    <LogoField
                      value={value}
                      color={editing.color}
                      fallback={editing.short_name || (editing.name || "").slice(0, 3).toUpperCase()}
                      onChange={(v) => setEditing({ ...editing, [f.name]: v })}
                    />
                  ) : f.type === "icon-select" ? (
                    <div className="row" style={{ gap: 10 }}>
                      <SectorIcon name={value || "generic"} color={editing.color} />
                      <Select
                        id={`f-${f.name}`}
                        options={(options || []).map(([v, l]) => ({ value: String(v), label: l }))}
                        value={value ?? ""}
                        onChange={(v) => setEditing({ ...editing, [f.name]: v })}
                        required
                      />
                    </div>
                  ) : f.type === "select" ? (
                    <Select
                      id={`f-${f.name}`}
                      options={(options || []).map(([v, l]) => ({ value: String(v), label: l }))}
                      value={value ?? ""}
                      onChange={(v) => setEditing({ ...editing, [f.name]: v })}
                      placeholder="— None —"
                      required={f.required}
                    />
                  ) : f.type === "color" ? (
                    <div className="row" style={{ gap: 8 }}>
                      <input id={`f-${f.name}`} type="color" value={value || "var(--lime)"}
                        onChange={(e) => setEditing({ ...editing, [f.name]: e.target.value })}
                        style={{ width: 44, height: 36, padding: 2, border: "1px solid var(--rule)", borderRadius: "var(--r-2)", background: "var(--surface)" }} />
                      <input className="field-input text-mono" value={value} placeholder="var(--lime)"
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

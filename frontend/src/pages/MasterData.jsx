import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const TABS = [
  {
    key: "countries",
    label: "Pays",
    url: "/api/reference/countries/",
    sub: "Referentiel GADM Admin 0 · rattachement aux hubs regionaux",
    cols: [
      { field: "iso3", label: "ISO3", mono: true, width: 90 },
      { field: "name", label: "Pays", strong: true },
      { field: "iso2", label: "ISO2", mono: true, width: 90 },
    ],
  },
  {
    key: "sectors",
    label: "Secteurs",
    url: "/api/reference/sectors/",
    sub: "Piliers LLF2 et themes transversaux",
    cols: [
      { field: "code", label: "Code", mono: true, width: 220 },
      { field: "name", label: "Secteur", strong: true },
    ],
  },
  {
    key: "sdgs",
    label: "ODD",
    url: "/api/reference/sdgs/",
    sub: "Objectifs de developpement durable · Nations Unies",
    cols: [
      { field: "number", label: "N°", mono: true, width: 60 },
      { field: "name", label: "Objectif", strong: true },
    ],
  },
];

export default function MasterData() {
  const [tab, setTab] = useState("countries");
  const current = TABS.find((t) => t.key === tab);

  const { data, isLoading } = useQuery({
    queryKey: ["masterdata", tab],
    queryFn: () => apiFetch(current.url),
  });

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Referentiels</div>
        <h1 className="view-title">Donnees de base</h1>
        <p className="view-lead">
          Elements reutilises par tous les projets du portefeuille. Ces donnees sont chargees a
          l'initialisation puis maintenues via les ecrans d'administration.
        </p>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {tab === t.key && data && <span className="tab-count">{data.length}</span>}
          </button>
        ))}
      </div>

      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title">{current.label}</h2>
            <div className="card-sub">{current.sub}</div>
          </div>
          {data && <span className="badge badge-lime">{data.length} entrees</span>}
        </div>

        {isLoading && (
          <div className="loading-wrap" style={{ minHeight: 160 }}>
            <span className="spinner" /> Chargement...
          </div>
        )}

        {data && (
          <table className="table">
            <thead>
              <tr>
                {current.cols.map((c) => (
                  <th key={c.field} style={c.width ? { width: c.width } : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id ?? row.number ?? i}>
                  {current.cols.map((c) => (
                    <td
                      key={c.field}
                      className={c.mono ? "text-mono text-xs" : undefined}
                      style={c.strong ? { fontWeight: 500 } : undefined}
                    >
                      {row[c.field]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { COLOR, FONT } from "../theme";

const TABS = [
  { key: "countries", label: "Pays", url: "/api/reference/countries/", cols: [["name", "Nom"], ["iso3", "ISO3"]] },
  { key: "sectors", label: "Secteurs", url: "/api/reference/sectors/", cols: [["name", "Nom"], ["code", "Code"]] },
  { key: "sdgs", label: "ODD", url: "/api/reference/sdgs/", cols: [["number", "N°"], ["name", "Nom"]] },
];

export default function MasterData() {
  const [tab, setTab] = useState("countries");
  const current = TABS.find((t) => t.key === tab);

  const { data, isLoading } = useQuery({
    queryKey: ["masterdata", tab],
    queryFn: () => apiFetch(current.url),
  });

  return (
    <div style={{ padding: "2rem", fontFamily: FONT.body }}>
      <h2 style={{ color: COLOR.navy, fontFamily: FONT.display }}>Donnees de reference</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: `1px solid ${COLOR.rule}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? `2px solid ${COLOR.lime}` : "2px solid transparent",
              color: tab === t.key ? COLOR.navy : COLOR.muted,
              fontWeight: tab === t.key ? 600 : 500,
              padding: "0.6rem 0.9rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p>Chargement...</p>}

      {data && (
        <table style={{ width: "100%", borderCollapse: "collapse", background: COLOR.paper }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${COLOR.navy}` }}>
              {current.cols.map(([field, label]) => (
                <th key={field} style={{ padding: "0.6rem" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.id ?? row.number ?? i} style={{ borderBottom: `1px solid ${COLOR.rule}` }}>
                {current.cols.map(([field]) => (
                  <td key={field} style={{ padding: "0.6rem" }}>
                    {row[field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

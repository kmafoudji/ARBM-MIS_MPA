import { useMemo, useState } from "react";

/**
 * Tableau reutilisable : recherche plein texte, filtres par colonne,
 * tri et pagination — le tout cote client.
 *
 * Choix assume : les referentiels comptent quelques dizaines de lignes et
 * l'API les renvoie deja en entier. Filtrer cote client evite un
 * aller-retour reseau a chaque frappe. A rebasculer cote serveur le jour
 * ou une table depasse le millier de lignes (indicateurs, beneficiaires).
 */
export default function DataTable({
  rows,
  columns,
  searchKeys,
  filters = [],
  defaultFilters = {},
  pageSize = 15,
  emptyLabel = "Aucun resultat.",
  rowKey = (r) => r.id,
  rowClass,
  onRowClick,
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(defaultFilters);
  const [sort, setSort] = useState(null); // { key, dir }
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q))
      );
    }

    for (const [key, value] of Object.entries(active)) {
      if (!value) continue;
      out = out.filter((r) => String(r[key] ?? "") === value);
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const get = col?.sortValue || ((r) => r[sort.key]);
      out = [...out].sort((a, b) => {
        const va = get(a), vb = get(b);
        if (va === vb) return 0;
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va ?? "").localeCompare(String(vb ?? ""), "fr");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }

    return out;
  }, [rows, query, active, sort, searchKeys, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function reset(setter) {
    return (...args) => {
      setter(...args);
      setPage(1);
    };
  }

  function toggleSort(key) {
    setSort((s) =>
      s?.key === key
        ? s.dir === "asc" ? { key, dir: "desc" } : null
        : { key, dir: "asc" }
    );
  }

  const hasControls = searchKeys?.length || filters.length;

  return (
    <>
      {hasControls && (
        <div className="table-toolbar">
          {searchKeys?.length > 0 && (
            <input
              className="field-input table-search"
              type="search"
              value={query}
              onChange={reset((e) => setQuery(e.target.value))}
              placeholder="Rechercher..."
              aria-label="Rechercher dans le tableau"
            />
          )}
          {filters.map((f) => (
            <select
              key={f.key}
              className="field-select table-filter"
              value={active[f.key] || ""}
              onChange={reset((e) => setActive({ ...active, [f.key]: e.target.value }))}
              aria-label={f.label}
            >
              <option value="">{f.label} : tous</option>
              {f.options.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          ))}
          <span className="table-count">
            {filtered.length} / {rows.length}
          </span>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={c.sortable ? "th-sortable" : undefined}
                onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc" ? "ascending" : "descending"
                    : undefined
                }
              >
                {c.label}
                {c.sortable && (
                  <span className="th-arrow">
                    {sort?.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-muted" style={{ padding: "var(--s-5)", textAlign: "center" }}>
                {query || Object.values(active).some(Boolean)
                  ? "Aucun resultat pour cette recherche."
                  : emptyLabel}
              </td>
            </tr>
          )}
          {pageRows.map((r) => (
            <tr
              key={rowKey(r)}
              className={rowClass ? rowClass(r) : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.cellClass}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className="pagination">
          <button
            className="btn btn-sm"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage === 1}
          >
            ← Precedent
          </button>
          <span className="text-sm text-muted">
            Page {safePage} sur {pageCount}
          </span>
          <button
            className="btn btn-sm"
            onClick={() => setPage(safePage + 1)}
            disabled={safePage === pageCount}
          >
            Suivant →
          </button>
        </div>
      )}
    </>
  );
}

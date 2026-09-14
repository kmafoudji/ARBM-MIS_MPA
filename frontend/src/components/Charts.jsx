/* Charts shared by the portfolio dashboards (Fund performance, Executive
   dashboard). This app carries no charting library: bars are flex boxes and
   donuts are conic gradients, as the portfolio map builds its cluster rings.
   The classes are the ones the Tier III page introduced (styles.css,
   "fund-"), kept so both pages read as one system. */

/* Tints for the slices of a one-hue donut: the hue, then neutrals. Ordered so
   the largest slice carries the colour. */
const SLICE_TINTS = ["var(--ink-soft)", "var(--muted)", "var(--subtle)", "var(--rule)"];

export function Card({ title, sub, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="fund-col-blank">{children}</div>;
}

/* One labelled bar. `max` is the scale, so a row can be read against its
   siblings rather than against its own width. A null value has no source and
   says so; it is never drawn as an empty bar that would read as zero. */
export function Bar({ label, value, display, max, color, suffix = "", className = "", untracked = "not tracked" }) {
  const width = max > 0 && value != null ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className={`fund-bar-row ${className}`}>
      <span className="fund-bar-label">{label}</span>
      <div className="fund-bar-track">
        {value == null ? (
          <span className="fund-bar-empty">{untracked}</span>
        ) : (
          <div className="fund-bar-fill" style={{ width: `${width}%`, background: color }}>
            {width > 18 ? display : ""}
          </div>
        )}
      </div>
      <span className="fund-bar-value">{value == null ? "—" : `${display}${suffix}`}</span>
    </div>
  );
}

/* A donut. With `color` the slices are that hue then neutrals; with `colors`
   (or a `color` on each row) every slice keeps its own, for categories that
   have a fixed hue such as sectors. Rows with no value are listed in the
   legend but draw no slice. `center` is shown in the hole. */
export function Donut({ rows, color, colors, format = (v) => v, center }) {
  if (!rows.length) return <Empty>Nothing recorded yet.</Empty>;

  const tints = colors || [color, ...SLICE_TINTS];
  const tintOf = (row, i) => row.color || tints[i % tints.length];
  // Each slice starts where the previous ones ended, so the stops accumulate.
  const stops = rows.reduce((acc, row, i) => {
    const start = acc.at;
    const end = start + (row.share || 0);
    return { at: end, list: [...acc.list, `${tintOf(row, i)} ${start}% ${end}%`] };
  }, { at: 0, list: [] }).list;

  return (
    <div className="fund-donut-wrap">
      <div className="fund-donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        {center && <div className="exec-donut-mid">{center}</div>}
      </div>
      <div className="fund-legend">
        {rows.map((row, i) => (
          <div key={row.label} className="fund-legend-row">
            <span className="fund-legend-dot" style={{ background: row.value == null ? "var(--rule)" : tintOf(row, i) }} />
            <span className="fund-legend-label" title={row.label}>{row.label}</span>
            <span className="fund-legend-value">
              {row.value == null ? "—" : `${format(row.value)} · ${row.share}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

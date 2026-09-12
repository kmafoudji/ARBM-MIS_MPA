import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import RefreshBar from "../components/RefreshBar.jsx";

/* Tier III — how the Fund itself is performing, as opposed to the projects in
   it. Annex L lists 34 operational indicators in five sections; none of them
   is ever typed in, every one is computed from the shared record.
   Thirteen have a source in the database today. The other twenty-one are
   shown all the same, greyed and carrying the reason they cannot be computed:
   the gaps are the most useful thing on this page, and hiding them would turn
   a map of what the Fund does not yet track into a page that looks complete. */

/* Palette token per section, sent by the backend (docs/design.md). */
const SECTION_COLOR = {
  green:  "var(--green)",
  blue:   "var(--blue)",
  orange: "var(--orange)",
  rose:   "var(--rose)",
  violet: "var(--violet)",
};

/* Long figures stay readable: 2 310 000 000 is a wall, 2.31 bn is a number. */
function fmtValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") return String(value);
  return value >= 1000 ? value.toLocaleString() : String(value);
}

function Tile({ indicator, color }) {
  const { code, name, available, value, unit, note, reason } = indicator;
  const shown = fmtValue(value);

  if (!available) {
    return (
      <div className="fund-tile off">
        <span className="fund-tile-code">{code}</span>
        <div className="fund-tile-name">{name}</div>
        <div className="fund-tile-untracked">Not tracked</div>
        <div className="fund-tile-reason">{reason}</div>
      </div>
    );
  }

  return (
    <div className="fund-tile" style={{ "--tile-color": color }}>
      <span className="fund-tile-code">{code}</span>
      <div className="fund-tile-name">{name}</div>
      {shown === null ? (
        // Computable, but nothing recorded yet. A dash, never a zero.
        <div className="fund-tile-pending" title="Nothing recorded yet">—</div>
      ) : (
        <div className="fund-tile-value">
          {shown}
          {unit && <span className="unit">{unit}</span>}
        </div>
      )}
      {note && <div className="fund-tile-note">{note}</div>}
    </div>
  );
}

export default function FundPerformance() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["fund-performance"],
    queryFn: () => apiFetch("/api/results/fund-performance/"),
    staleTime: 60_000,
  });

  const summary = data?.summary;
  const untracked = summary ? summary.indicators_total - summary.indicators_available : 0;

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Annex L · Tier III · Operational indicators</div>
        <h1 className="view-title">Fund performance</h1>
        <p className="view-lead">
          How the Fund itself is performing — quality, reach, money, speed and voice.
          Every figure is computed from the shared record; nothing on this page is typed in.
        </p>
        <div style={{ marginTop: 8 }}>
          <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
        </div>
      </div>

      {isLoading && <div className="spinner" />}
      {error && <div className="notice notice-warn">{error.detail || "Could not load fund performance."}</div>}

      {data && (
        <>
          <div className="fund-coverage">
            <div className="fund-coverage-figure">
              <b style={{ color: "var(--green)" }}>{summary.indicators_available}</b>
              <span>computed<br />from the record</span>
            </div>
            <div className="fund-coverage-figure">
              <b style={{ color: "var(--subtle)" }}>{untracked}</b>
              <span>not tracked<br />by the system</span>
            </div>
            <div className="fund-coverage-figure">
              <b>{summary.projects_in_scope}</b>
              <span>projects<br />in scope</span>
            </div>
            <div className="fund-coverage-note">
              No target is shown: Annex L marks every Tier III baseline and target
              <b> TBD</b>, so there is nothing to score a value against and no RAG
              colour to give it. Figures are computed live — no history of them is
              kept, so there is no trend either.
            </div>
          </div>

          {data.sections.map((section) => {
            const color = SECTION_COLOR[section.color] || "var(--ink)";
            const available = section.indicators.filter((i) => i.available).length;
            return (
              <div key={section.key} className="cat-section">
                <div className="section-bar" style={{ background: color }}>
                  <span>{section.number} · {section.name}</span>
                  <span className="count">
                    {available} of {section.indicators.length} computed
                  </span>
                </div>
                <div className="fund-tiles">
                  {section.indicators.map((indicator) => (
                    <Tile key={indicator.code} indicator={indicator} color={color} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

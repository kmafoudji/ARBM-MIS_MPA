/**
 * A tab whose source does not exist.
 *
 * The client's workplan pack has views this system cannot draw because the
 * data behind them is not recorded anywhere. Following the Tier III dashboard
 * and the Overview cockpit, the view keeps its place and says what is missing
 * rather than showing an empty table that reads as "nothing happened".
 */

export default function NotTrackedView({ title, reason, missing = [] }) {
  return (
    <div className="wp-gap">
      <div className="wp-gap-badge">Not tracked</div>
      <h4>{title}</h4>
      <p>{reason}</p>
      {missing.length > 0 && (
        <ul>
          {missing.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

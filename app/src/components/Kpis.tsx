import { isLive } from '../lib/releases';

export interface Kpi {
  label: string;
  value: string;
  note?: string;
  onClick?: () => void;
}

// The row of white stat cards at the top of a screen: label (and optional
// note) bottom-left, the big number bottom-right. From release 1.16 the list
// pages no longer show them; \`keep\` is for a row that holds a record's own
// details (a load's page) rather than counts, which stays.
export function Kpis({ items, keep = false }: { items: Kpi[]; keep?: boolean }) {
  if (!keep && isLive('no-summary-cards')) return null;
  return (
    <div className="ui-kpis">
      {items.map((k) => (
        <div key={k.label} className={`ui-kpi${k.onClick ? ' is-clickable' : ''}`} onClick={k.onClick}>
          <div>
            <div className="ui-kpi-label">{k.label}</div>
            {k.note && <div className="ui-kpi-note">{k.note}</div>}
          </div>
          <div className="ui-kpi-value">{k.value}</div>
        </div>
      ))}
    </div>
  );
}

import { useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { LoadDocuments, LoadStatusDialog, PipelineMove } from '../../components/LoadDialogs';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { facilityFor, stopHint } from '../../data/facilities';
import { usd } from '../../data/invoicing';
import { LOAD_TAG, loadTotal } from '../../data/loads';
import { when } from '../../lib/format';
import { isLive } from '../../lib/releases';

export function LoadDetailPage() {
  const { id = '' } = useParams();
  const { loads, facilities } = useAppShell();
  const sel = loads.find((l) => l.id.toLowerCase() === id.toLowerCase());
  // Release 1.13: the pipeline moves are in the top bar; a status between
  // stages (At pickup, Delayed, Needs POD) is set from "Change status".
  const topBarMoves = isLive('load-detail-moves');
  const [changing, setChanging] = useState(false);

  // A deleted load, or a mistyped link.
  if (!sel) {
    return (
      <Card>
        <h2 className="ui-h2" style={{ margin: 0 }}>Load {id} not found</h2>
        <p className="ui-p">It may have been deleted.</p>
        <Link className="ui-link" to="/app/loads">← Back to loads</Link>
      </Card>
    );
  }

  const delivered = sel.status === 'Delivered';
  // Release 1.9: status, documents and history are worked from this page.
  const tracking = isLive('load-tracking');

  // Loads entered with New Load carry their own stops, documents and history.
  const stops = sel.stops
    ? sel.stops.map((s) => ({ kind: s.kind, kindClass: s.kind === 'Pickup' ? 'pickup' : 'delivery', name: s.name, address: s.address, window: s.when }))
    : [
        { kind: sel.status === 'At pickup' ? 'Pickup · at shipper' : 'Pickup · complete', kindClass: 'pickup', name: sel.from, address: sel.fromAddr, window: `Pickup ${sel.pickup} · 08:00–14:00` },
        { kind: 'Fuel stop', kindClass: '', name: 'Planned · 92 gal, DEF top-off', address: 'Routed automatically on the lane', window: `${sel.pickup} · 16:40` },
        { kind: delivered ? 'Delivery · complete' : 'Delivery', kindClass: 'delivery', name: sel.to, address: sel.toAddr, window: `Deliver ${sel.delivery} · 06:00–12:00` },
      ];

  const facts: { k: string; v: string; note?: string }[] = [
    { k: 'Miles', v: sel.miles },
    // With fuel or accessorials on the load, the customer pays more than the line haul.
    { k: 'Line haul', v: sel.rate, note: [sel.rpm === '—' ? '' : `${sel.rpm} / mi`, sel.charges && loadTotal(sel) !== sel.charges.lineHaul ? `${usd(loadTotal(sel))} total to customer` : ''].filter(Boolean).join(' · ') || undefined },
    { k: sel.carrierRate ? 'Carrier cost' : 'Driver pay', v: sel.pay }, { k: 'Margin', v: sel.margin },
  ];
  const freight = [
    ...(sel.mode ? [{ k: 'Mode', v: sel.mode }] : []),
    { k: 'Commodity', v: sel.commodity }, { k: 'Weight', v: sel.weight }, { k: 'Equipment', v: sel.equip },
    { k: 'Temperature', v: sel.temp }, { k: 'Reference', v: sel.ref },
    ...(sel.ltl ? [{ k: 'LTL', v: sel.ltl }] : []),
  ];
  const carrier = [
    { k: 'Carrier', v: sel.carrier }, { k: 'MC #', v: sel.carrierMc }, { k: 'DOT #', v: sel.carrierDot },
    ...(sel.carrierRate ? [{ k: 'Carrier rate', v: sel.carrierRate }] : []),
  ];
  const docs = sel.documents
    ? sel.documents.map((d) => ({ name: d.name, state: d.file ? 'Attached' : 'Pending' }))
    : [
        { name: 'Rate confirmation', state: 'Attached' },
        { name: 'Bill of lading', state: delivered || sel.status === 'Needs POD' ? 'Attached' : 'Pending' },
        { name: 'Proof of delivery', state: delivered ? 'Attached' : 'Pending' },
      ];
  // What happened to the load, newest last: its recorded history (who and
  // when), or for a load saved before history was kept, what is known.
  const activity = sel.history?.length
    ? [
        ...sel.history.map((h) => ({ when: when(h.at), what: `${h.what} · ${h.by}` })),
        ...(sel.notes ? [{ when: '', what: `Driver instructions: ${sel.notes}` }] : []),
      ]
    : sel.createdAt || sel.form
      ? [
          { when: 'Earlier', what: 'Load created' },
          ...(sel.notes ? [{ when: '', what: `Driver instructions: ${sel.notes}` }] : []),
          ...(sel.updatedAt ? [{ when: 'Earlier', what: 'Load edited' }] : []),
        ]
      : [
          { when: 'Today 07:12', what: 'Driver accepted the load in the app' },
          { when: 'Today 08:41', what: `Arrived at ${sel.from}` },
          { when: 'Today 10:05', what: 'Bill of lading uploaded from the cab' },
          { when: 'Today 10:06', what: delivered ? 'Invoice queued for billing' : 'Dispatch notified the consignee' },
        ];

  const rowStyle = (i: number): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0',
    borderTop: i ? '1px solid var(--ui-border)' : 0,
  });
  const kv = (rows: { k: string; v: string }[]) => (
    <div className="ui-kv" style={{ marginTop: 0 }}>
      {rows.map((f) => (
        <div key={f.k}>
          <div className="ui-label">{f.k}</div>
          <div className="ui-kv-value">{f.v}</div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Card>
        <h2 className="ui-h2" style={{ margin: 0 }}>{sel.route}</h2>
        <div style={{ marginTop: 6, fontSize: 14, color: 'var(--ui-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span>Load {sel.id} · {sel.customer}</span>
          {tracking ? <Tag label={sel.status} tagClass={LOAD_TAG[sel.status] ?? sel.tagClass} /> : <span>· {sel.status}</span>}
          {tracking && sel.deliveredOn && <span>· delivered {sel.delivery}</span>}
          {topBarMoves && <button type="button" className="ui-link" onClick={() => setChanging(true)}>Change status</button>}
        </div>
        {/* Release 1.12: move the load along the pipeline, or back a step (in the top bar from 1.13). */}
        {isLive('load-pipeline-moves') && !topBarMoves && <div style={{ marginTop: 12 }}><PipelineMove load={sel} /></div>}
        {changing && <LoadStatusDialog load={sel} onClose={() => setChanging(false)} />}
      </Card>

      <Kpis keep items={facts.map((f) => ({ label: f.k, value: f.v, note: f.note }))} />

      <div className="ui-grid-2">
        <Card title="Stops">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stops.map((s, i) => {
              // Registered sites add what the driver needs to know there.
              const site = facilityFor(facilities.filter((f) => !f.archived), s.name);
              return (
                <div key={i} className="ui-stop">
                  <div className={`ui-stop-kind${s.kindClass ? ` ${s.kindClass}` : ''}`}>{s.kind}</div>
                  <div className="ui-stop-name">{s.name}</div>
                  <div className="ui-stop-meta">{s.address}</div>
                  <div className="ui-stop-meta">{s.window}</div>
                  {site && (
                    <div className="ui-stop-meta">
                      {stopHint(site)} · <Link className="ui-link" style={{ fontSize: 12 }} to={`/app/facilities?open=${site.id}`}>Facility →</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="ui-placeholder" style={{ marginTop: 20 }}>Live map / ELD trace</div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card title="Freight & pay">{kv(freight)}</Card>

          <Card title="Carrier">{kv(carrier)}</Card>

          <Card title="Documents">
            {tracking ? <LoadDocuments load={sel} /> : docs.map((d, i) => (
              <div key={d.name} style={rowStyle(i)}>
                <div style={{ flex: 1 }}>{d.name}</div>
                <Tag label={d.state} tagClass={d.state === 'Attached' ? 'tag-green' : 'tag-outline'} />
              </div>
            ))}
          </Card>

          <Card title="Activity">
            {activity.map((a, i) => (
              <div key={i} style={rowStyle(i)}>
                <div style={{ width: 150, flex: 'none', fontSize: 13, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.when}</div>
                <div style={{ flex: 1 }}>{a.what}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

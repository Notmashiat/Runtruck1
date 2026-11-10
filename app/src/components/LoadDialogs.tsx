import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import { fmtDate } from '../data/invoicing';
import {
  DOCUMENT_SLOTS, LOAD_STATUSES, billingByLoad, isCovered, isDelivered, normalizeLoad, pipelineSteps, stageOf, statusForStage, withStatus,
  type LoadDocument, type LoadStage, type LoadStatus,
} from '../data/loads';
import { USER, type Load } from '../data/mock';
import { downloadDocument, fileSize, openDocument } from '../lib/attachments';
import { todayIso } from '../lib/clock';
import { isLive } from '../lib/releases';
import { AttachDialog } from './AttachDialog';
import { Field } from './FormBits';
import { SmallDialog } from './SmallDialog';
import { Tag } from './Tag';

const covered = isCovered;

// Statuses a load can have with nobody to haul it yet.
const UNCOVERED_OK: string[] = ['Needs driver', 'Booked'];

// What a status means, shown under the choice.
const ABOUT: Record<LoadStatus, string> = {
  'Needs driver': 'On the board with nobody assigned.',
  Booked: 'The driver or carrier is lined up; the load has not set off yet.',
  Dispatched: 'Assigned and waiting for the pickup date.',
  'At pickup': 'The truck is at the shipper.',
  'In transit': 'Loaded and on the road.',
  Delayed: 'Running late; the customer should be told.',
  'Needs POD': 'Delivered, waiting for the signed proof of delivery. It can be invoiced, with a warning.',
  Delivered: 'Delivered with the proof of delivery in. Ready to invoice and counted for driver pay.',
};

// Update status: where the load is now. Delivering it records the day, which
// is what invoicing and driver pay go by.
// `to` opens it with a new status already chosen (a pipeline move).
export function LoadStatusDialog({ load, to, onClose }: { load: Load; to?: LoadStatus; onClose: () => void }) {
  const { updateLoad, customers } = useAppShell();
  const today = todayIso();
  // Release 1.12: 'Booked' exists, and Dispatched means the driver has set off.
  const booking = isLive('load-pipeline-moves');
  const choices = LOAD_STATUSES.filter((s) => booking || s !== 'Booked');
  const about = (s: LoadStatus) => (booking && s === 'Dispatched' ? 'The driver is on the way to the pickup.' : ABOUT[s]);
  const current = (LOAD_STATUSES as readonly string[]).includes(load.status) ? (load.status as LoadStatus) : 'Dispatched';
  const [status, setStatus] = useState<LoadStatus>(to ?? current);
  const [deliveredOn, setDeliveredOn] = useState(load.deliveredOn || (load.deliveryDate && load.deliveryDate <= today ? load.deliveryDate : today));
  const [note, setNote] = useState('');

  const needsCover = !UNCOVERED_OK.includes(status) && !covered(load);
  // Release 1.21: a customer on credit hold can have loads, but they are not
  // dispatched until accounting approves credit (CRM › the customer).
  const onHold = !UNCOVERED_OK.includes(status) && UNCOVERED_OK.includes(current)
    && customers.some((c) => c.name === load.customer && c.credit === 'Credit hold');
  const future = isDelivered(status) && deliveredOn > today;
  const beforePickup = isDelivered(status) && Boolean(load.pickupDate) && deliveredOn < (load.pickupDate ?? '');
  const problem = needsCover ? 'Assign a driver or a partner carrier first (Edit load).'
    : onHold ? `${load.customer} is on credit hold: the load can’t be dispatched until accounting approves credit.`
    : isDelivered(status) && !deliveredOn ? 'Enter the day it was delivered.'
      : future ? 'The delivery day cannot be in the future.'
        : beforePickup ? `The delivery day cannot be before the pickup (${fmtDate(load.pickupDate)}).` : '';
  const unchanged = status === current && (!isDelivered(status) || deliveredOn === (load.deliveredOn ?? ''));

  return (
    <SmallDialog
      label={`Load ${load.id}`} title="Update status" confirm="Save status" disabled={Boolean(problem) || unchanged}
      intro={`${load.customer} · ${load.route}. Now: ${load.status}.`}
      onConfirm={() => updateLoad(withStatus(load, status, USER.name, isDelivered(status) ? deliveredOn : undefined, note))}
      onClose={onClose}
    >
      <div className="ui-form-grid">
        <Field label="Status" required help={about(status)}>
          <select className="ui-input" value={status} onChange={(e) => setStatus(e.target.value as LoadStatus)}>
            {choices.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {isDelivered(status) && (
          <Field label="Delivered on" required help="Invoices and driver pay use this day.">
            <input className="ui-input" type="date" max={today} value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} />
          </Field>
        )}
        <Field label="Note" wide help="Optional: what happened, who was told.">
          <input className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {problem && <div className="ui-errors">{problem}</div>}
    </SmallDialog>
  );
}

// Moving a load one stage along the pipeline, or back one to undo a
// mistake (release 1.12). The first four stages follow the load's status, so
// a move opens Update status with the new status chosen: one more click to
// confirm, and the delivery day when it is delivered. Invoiced and Complete
// follow the load's invoice, so those moves are made in Accounting.
export function PipelineMove({ load }: { load: Load }) {
  const { invoices } = useAppShell();
  const navigate = useNavigate();
  const [to, setTo] = useState<LoadStatus | null>(null);
  // Release 1.13: going back is an orange button that asks first.
  const [goingBack, setGoingBack] = useState(false);
  const warnBack = isLive('load-detail-moves');
  const stage = stageOf(load, billingByLoad(invoices));
  const steps = pipelineSteps(stage);
  const back = steps.back;
  const next = steps.next && steps.next !== 'Invoiced' && steps.next !== 'Complete' ? steps.next : null;
  const move = (s: LoadStage) => setTo(statusForStage(s, covered(load)));

  return (
    <div className="load-move" onClick={(e) => e.stopPropagation()}>
      {back && (
        <button type="button" className={`ui-btn ui-btn-sm${warnBack ? ' ui-btn-orange' : ''}`} onClick={() => (warnBack ? setGoingBack(true) : move(back))}>
          ← Back to {back}
        </button>
      )}
      {goingBack && back && <MoveBackDialog load={load} back={back} onClose={() => setGoingBack(false)} />}
      {next && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => move(next)}>Move to {next} →</button>}
      {stage === 'Delivered' && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => navigate('/app/accounting/uninvoiced')}>Create invoice →</button>}
      {stage === 'Invoiced' && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => navigate('/app/accounting/invoiced')}>Record payment →</button>}
      {(stage === 'Invoiced' || stage === 'Complete') && (
        <span className="ui-stop-meta" style={{ marginTop: 0 }}>Billed: to move it back, change or delete its invoice in Accounting.</span>
      )}
      {to && <LoadStatusDialog load={load} to={to} onClose={() => setTo(null)} />}
    </div>
  );
}

// Moving a load back one stage, after a warning (release 1.13): for when it
// was moved forward by mistake. The load gets the earlier stage's status and
// the move is noted in its history; moving it back from Delivered also
// clears the delivery day.
export function MoveBackDialog({ load, back, onClose }: { load: Load; back: LoadStage; onClose: () => void }) {
  const { updateLoad, invoices } = useAppShell();
  const status = statusForStage(back, covered(load));
  const now = stageOf(load, billingByLoad(invoices));
  return (
    <SmallDialog
      label={`Load ${load.id}`} title={`Move back to ${back}?`} confirm={`Move back to ${back}`} warning disabled={!status}
      intro={`${load.customer} · ${load.route}. This load is at ${now}. Moving it back sets its status to ${status ?? back}${isDelivered(load.status) ? ' and clears the day it was delivered' : ''}. Do this only to undo a mistake; the change is noted in the load’s history.`}
      onConfirm={() => { if (status) updateLoad(withStatus(load, status, USER.name, undefined, 'moved back')); }}
      onClose={onClose}
    />
  );
}

// The documents on a load's page: what is attached, opening and downloading
// it, and attaching or replacing a file. Attaching the proof of delivery to
// a load that is waiting for it marks the load Delivered.
export function LoadDocuments({ load }: { load: Load }) {
  const { updateLoad } = useAppShell();
  const [attaching, setAttaching] = useState<string | null>(null);
  // Loads from before documents were kept get the usual slots, all empty.
  const docs: LoadDocument[] = load.documents ?? DOCUMENT_SLOTS.map((name) => ({ name, file: '' }));

  const attach = (name: string, doc: BillDocument) => {
    const at = new Date().toISOString();
    const withDoc: Load = {
      ...load,
      documents: docs.map((d) => (d.name === name ? { name, file: doc.name, doc } : d)),
      history: [...(load.history ?? []), { at, by: USER.name, what: `${name} attached (${doc.name})` }],
    };
    const done = name === 'Proof of delivery' && load.status === 'Needs POD';
    updateLoad(done ? withStatus(withDoc, 'Delivered', USER.name, load.deliveredOn, 'proof of delivery attached') : normalizeLoad(withDoc));
  };
  const remove = (name: string) => {
    if (!window.confirm(`Remove the ${name.toLowerCase()} from ${load.id}?`)) return;
    updateLoad({
      ...load,
      documents: docs.map((d) => (d.name === name ? { name, file: '' } : d)),
      history: [...(load.history ?? []), { at: new Date().toISOString(), by: USER.name, what: `${name} removed` }],
    });
  };

  return (
    <>
      {docs.map((d, i) => (
        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--ui-border)' : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{d.name}</div>
            {d.file && (
              <div className="ui-stop-meta" style={{ marginTop: 2, overflowWrap: 'anywhere' }}>
                {d.doc ? <button type="button" className="crm-doc-open" onClick={() => { void openDocument(d.doc as BillDocument); }}>{d.file}</button> : d.file}
                {d.doc ? ` · ${fileSize(d.doc.size)}` : ' · name only (attach the file to open it here)'}
              </div>
            )}
          </div>
          {d.doc && <button type="button" className="ui-link" onClick={() => { void downloadDocument(d.doc as BillDocument); }}>Download</button>}
          {d.file && <button type="button" className="ui-link is-danger" onClick={() => remove(d.name)}>Remove</button>}
          <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAttaching(d.name)}>{d.file ? 'Replace' : 'Attach'}</button>
          <Tag label={d.file ? 'Attached' : 'Pending'} tagClass={d.file ? 'tag-green' : 'tag-outline'} />
        </div>
      ))}
      {attaching && (
        <AttachDialog
          title={`Load ${load.id}`} only={attaching} accept=".pdf,image/*"
          onAttach={(added) => { if (added[0]) attach(attaching, added[0]); }}
          onClose={() => setAttaching(null)}
        />
      )}
    </>
  );
}

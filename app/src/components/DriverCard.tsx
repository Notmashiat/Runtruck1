import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { drivingModeOf, coDriverOf, type FleetDriver } from '../data/fleet';
import { fmtDate } from '../data/invoicing';
import { todayIso } from '../lib/clock';
import { lazyNamed } from '../lib/lazyPage';
import { isLive } from '../lib/releases';
import { useModal } from './FormBits';
import { Tag } from './Tag';

// The driver editor is only downloaded when "Edit info" is clicked.
const DriverDialog = lazyNamed(() => import('./FleetDialogs'), 'DriverDialog');

const text = (d: FleetDriver, k: string) => (typeof d.details[k] === 'string' ? (d.details[k] as string).trim() : '');
const list = (d: FleetDriver, k: string) => (Array.isArray(d.details[k]) ? (d.details[k] as string[]) : []);

// A date with a warning when it has passed.
function Expiry({ iso }: { iso: string }) {
  if (!iso) return <>—</>;
  const past = iso < todayIso();
  return <span className={past ? 'drv-expired' : undefined}>{fmtDate(iso)}{past ? ' · expired' : ''}</span>;
}

function Item({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="drv-value">{children || '—'}</div>
    </div>
  );
}

// Phone and email as links that call or write.
const phoneLink = (p: string) => (p ? <a className="ui-link" href={`tel:${p.replace(/[^\d+]/g, '')}`}>{p}</a> : '');
const emailLink = (e: string) => (e ? <a className="ui-link" href={`mailto:${e}`}>{e}</a> : '');

// The driver card (release 1.15): who the driver is, their CDL, how they run
// (solo, team or strong solo, with the co-driver for a team), and how to
// reach them and their emergency contact. "Edit info" opens the editor.
export function DriverCard({ driver, onEdit, onClose }: { driver: FleetDriver; onEdit: () => void; onClose: () => void }) {
  const { drivers } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const mode = drivingModeOf(driver);
  const partner = mode === 'Team' ? coDriverOf(driver, drivers) : undefined;
  const address = [text(driver, 'street'), [text(driver, 'city'), [text(driver, 'state'), text(driver, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const cdl = [text(driver, 'cdlNumber'), text(driver, 'cdlState')].filter(Boolean).join(' · ');

  return (
    <dialog ref={ref} className="ui-dialog is-compact drv-card" aria-label={`Driver: ${driver.name}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)} onClick={(e) => e.stopPropagation()}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div className="drv-head">
            <span className="ui-avatar drv-avatar" aria-hidden="true">{driver.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
            <div>
              <h2 className="ui-h2" style={{ margin: 0 }}>{driver.name}</h2>
              <div className="drv-tags">
                <Tag label={driver.archived ? 'Archived' : driver.status} tagClass={driver.archived ? 'tag-neutral' : driver.tagClass} />
                <span className="ui-chip ui-chip-info">{mode}</span>
                {text(driver, 'employeeId') && <span className="ui-stop-meta" style={{ marginTop: 0 }}>ID {text(driver, 'employeeId')}</span>}
              </div>
            </div>
          </div>

          <div className="drv-group">
            <Item k="Date of birth">{text(driver, 'dob') ? fmtDate(text(driver, 'dob')) : ''}</Item>
            <Item k="Driver type">{text(driver, 'driverType')}</Item>
          </div>

          <div>
            <div className="drv-title">CDL</div>
            <div className="drv-group">
              <Item k="CDL number">{cdl}</Item>
              <Item k="Class">{text(driver, 'cdlClass') ? `Class ${text(driver, 'cdlClass')}` : ''}</Item>
              <Item k="Expires"><Expiry iso={text(driver, 'cdlExpiry')} /></Item>
              <Item k="Medical card expires"><Expiry iso={text(driver, 'medicalExpiry')} /></Item>
              <Item k="Endorsements">{list(driver, 'endorsements').join(', ') || 'None'}</Item>
              {text(driver, 'restrictions') && <Item k="Restrictions">{text(driver, 'restrictions')}</Item>}
            </div>
          </div>

          <div>
            <div className="drv-title">Contact</div>
            <div className="drv-group">
              <Item k="Mobile">{phoneLink(text(driver, 'phone'))}</Item>
              <Item k="Email">{emailLink(text(driver, 'email'))}</Item>
              <Item k="Address">{address}</Item>
            </div>
          </div>

          <div>
            <div className="drv-title">Emergency contact</div>
            <div className="drv-group">
              <Item k="Name">{[text(driver, 'emergencyName'), text(driver, 'emergencyRelation')].filter(Boolean).join(' · ')}</Item>
              <Item k="Phone">{phoneLink(text(driver, 'emergencyPhone'))}</Item>
            </div>
          </div>

          {mode === 'Team' && (
            <div className="drv-partner">
              <div className="drv-title">Co-driver</div>
              {partner ? (
                <div className="drv-group">
                  <Item k="Name">{partner.name}</Item>
                  <Item k="Status"><Tag label={partner.status} tagClass={partner.tagClass} /></Item>
                  <Item k="Mobile">{phoneLink(text(partner, 'phone'))}</Item>
                  <Item k="Email">{emailLink(text(partner, 'email'))}</Item>
                  <Item k="CDL">{[text(partner, 'cdlClass') ? `Class ${text(partner, 'cdlClass')}` : '', text(partner, 'cdlNumber')].filter(Boolean).join(' · ')}</Item>
                  <Item k="CDL expires"><Expiry iso={text(partner, 'cdlExpiry')} /></Item>
                </div>
              ) : (
                <p className="ui-p" style={{ margin: 0 }}>No co-driver set yet. Choose one in Edit info.</p>
              )}
            </div>
          )}
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-link" onClick={() => { closeNow(); onEdit(); }}>Edit info</button>
        </footer>
      </div>
    </dialog>
  );
}

// A driver's name that opens their card when clicked (release 1.15). A name
// that is not on the roster ('Unassigned', a partner carrier's driver) stays
// plain text; a team ('A / B') gives each name its own link. `onEdit` lets a
// page that already has the driver editor open its own; otherwise the card
// opens the editor itself.
export function DriverName({ name, onEdit }: { name: string; onEdit?: (d: FleetDriver) => void }) {
  const { drivers } = useAppShell();
  const [shown, setShown] = useState<FleetDriver | null>(null);
  const [editing, setEditing] = useState<FleetDriver | null>(null);
  if (!isLive('driver-card')) return <>{name}</>;
  const names = name.split(' / ');
  const open = (d: FleetDriver) => (e: MouseEvent) => {
    e.stopPropagation();
    setShown(d);
  };
  return (
    <>
      {names.map((n, i) => {
        const d = drivers.find((x) => x.name === n.trim());
        return (
          <Fragment key={`${n}-${i}`}>
            {i > 0 && ' / '}
            {d ? <button type="button" className="drv-name" onClick={open(d)}>{n.trim()}</button> : n}
          </Fragment>
        );
      })}
      {shown && <DriverCard driver={shown} onClose={() => setShown(null)} onEdit={() => (onEdit ? onEdit(shown) : setEditing(shown))} />}
      {/* Clicks in the editor stay in it (it can sit inside a clickable table row). */}
      {editing && <span onClick={(e) => e.stopPropagation()}><DriverDialog driver={editing} onClose={() => setEditing(null)} /></span>}
    </>
  );
}

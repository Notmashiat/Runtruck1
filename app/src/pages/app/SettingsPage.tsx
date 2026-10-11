import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field, isEmail, launch, mailtoHref } from '../../components/FormBits';
import { useAppShell } from '../../context/AppShellContext';
import { reportError } from '../../lib/errorLog';
import { TERMS, fmtDate, invoiceTotal, nextInvoiceId, senderVars, usd } from '../../data/invoicing';
import { USER } from '../../data/mock';
import {
  ALERTS, DEFAULT_SETTINGS, ROLE_ABOUT, START_PAGES, TEAM_ROLES, TIME_ZONES, structuredCopy,
  type Accent, type Density, type Settings, type TeamMember, type TeamRole, type TextSize, type ThemeChoice,
} from '../../data/settings';
import { invoiceDoc } from '../../lib/invoicePdf';
import { openPdf } from '../../lib/pdf';
import { todayIso } from '../../lib/clock';
import { IS_DEMO, currentKey, isOwnKey } from '../../lib/account';
import { PERSONAL_SETTINGS } from '../../data/accounts';
import {
  MIN_PASSWORD, accountEmail, can, canLogOut, changeLoginEmail, changePassword, currentSession, isSuperAdmin, logOutAndLeave, loginEmailChangedOn,
  me, passwordChangedOn, passwordProblems,
} from '../../lib/auth';
import { defaultSettings, fillTemplate, useSettings } from '../../lib/settingsStore';
import { isLive } from '../../lib/releases';
import { ExportPanel } from '../../components/ExportPanel';

type SectionKey = 'profile' | 'company' | 'invoicing' | 'messages' | 'operations' | 'alerts' | 'team' | 'security' | 'appearance' | 'export' | 'data';
const SECTIONS: { key: SectionKey; title: string; about: string }[] = [
  { key: 'profile', title: 'Profile', about: 'Your name and contact details, used in the app and on emails you send.' },
  { key: 'company', title: 'Company', about: 'Your carrier details, printed on invoices and in emails.' },
  { key: 'invoicing', title: 'Invoicing & payments', about: 'Invoice numbers, terms, surcharges, late fees and how customers pay you.' },
  { key: 'messages', title: 'Messages', about: 'The emails and texts RunTruck prepares for invoices and reminders.' },
  { key: 'operations', title: 'Operations', about: 'Terminals, warning thresholds and detention defaults.' },
  { key: 'alerts', title: 'Alerts', about: 'What the dashboard’s Needs attention list shows.' },
  { key: 'team', title: 'Team', about: 'Who works in RunTruck and what they do.' },
  { key: 'security', title: 'Security', about: 'Your password and this browser’s sign-in.' },
  { key: 'appearance', title: 'Appearance', about: 'Theme, colour, text size, spacing and where the app opens.' },
  { key: 'export', title: 'Export data', about: 'Download the records you have access to as a PDF, Word, Excel or CSV file.' },
  { key: 'data', title: 'Data', about: 'Back up, restore or reset what is stored in this browser.' },
];

const STATE = /^[A-Za-z]{2}$/;
const digits = (s: string) => s.replace(/\D/g, '');

// — shared pieces —

// A section edited as a draft: Save or Discard at the bottom once it changes.
function useSection<K extends 'profile' | 'company' | 'invoicing' | 'messages' | 'operations'>(k: K) {
  const [s, update] = useSettings();
  const [draft, setDraft] = useState<Settings[K]>(() => structuredCopy(s[k]));
  const [tried, setTried] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(s[k]);
  return {
    draft,
    set: <F extends keyof Settings[K]>(f: F, v: Settings[K][F]) => setDraft((p) => ({ ...p, [f]: v }) as Settings[K]),
    setDraft,
    dirty,
    tried,
    savedAt,
    save: (valid: boolean, extra?: (next: Settings) => Settings) => {
      setTried(true);
      if (!valid) return false;
      update((p) => {
        const next = { ...p, [k]: draft } as Settings;
        return extra ? extra(next) : next;
      });
      setTried(false);
      setSavedAt(Date.now());
      return true;
    },
    discard: () => { setDraft(structuredCopy(s[k])); setTried(false); },
  };
}

function SaveBar({ dirty, savedAt, onSave, onDiscard, problems }: { dirty: boolean; savedAt: number; onSave: () => void; onDiscard: () => void; problems?: string[] }) {
  const justSaved = !dirty && savedAt > 0 && Date.now() - savedAt < 4000;
  if (!dirty && !justSaved) return null;
  return (
    <div className={`set-savebar${dirty ? '' : ' is-saved'}`} role="status">
      {dirty ? (
        <>
          <span>{problems?.length ? problems.join(' · ') : 'Unsaved changes'}</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={onDiscard}>Discard</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={onSave}>Save changes</button>
        </>
      ) : (
        <span>✓ Saved</span>
      )}
    </div>
  );
}

function Group({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <div className="set-group-head">
        <h3>{title}</h3>
        {about && <p>{about}</p>}
      </div>
      {children}
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`dash-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ui-filter" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={`ui-filter-opt${value === o ? ' is-active' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

const err = (tried: boolean, bad: boolean, msg: string) => (tried && bad ? msg : undefined);

// — sections —

function Profile() {
  const sec = useSection('profile');
  const d = sec.draft;
  const problems = [
    !d.name.trim() && 'Name is required',
    !isEmail(d.email) && 'Enter a valid email',
    d.phone.trim() !== '' && digits(d.phone).length < 10 && 'Phone needs 10 digits',
  ].filter(Boolean) as string[];
  const initials = d.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const save = () => {
    sec.save(problems.length === 0, (next) => ({
      ...next,
      // Keep your own entry on the Team list in step.
      team: next.team.map((m) => (m.email.toLowerCase() === USER.email.toLowerCase() ? { ...m, name: d.name.trim(), email: d.email.trim(), phone: d.phone } : m)),
    }));
  };
  return (
    <>
      <Group title="You" about="Shown in the sidebar, the dashboard greeting and on the emails and reminders you send.">
        <div className="set-profile">
          <span className="ui-avatar set-avatar" aria-hidden="true">{initials}</span>
          <div>
            <div className="set-profile-name">{d.name || 'Your name'}</div>
            <div className="ui-stop-meta">{[d.title, USER.company].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="ui-form-grid">
          <Field label="Full name" required error={err(sec.tried, !d.name.trim(), 'Required')}>
            <input className="ui-input" value={d.name} onChange={(e) => sec.set('name', e.target.value)} />
          </Field>
          <Field label="Job title" help="Shown under your name and in your email signature.">
            <input className="ui-input" value={d.title} onChange={(e) => sec.set('title', e.target.value)} placeholder="e.g. Dispatch" />
          </Field>
          <Field label="Email" required help="Your contact email, on emails you send. The login email is in Security." error={err(sec.tried, !isEmail(d.email), 'Enter a valid email')}>
            <input className="ui-input" type="email" value={d.email} onChange={(e) => sec.set('email', e.target.value)} />
          </Field>
          <Field label="Phone" error={err(sec.tried, d.phone.trim() !== '' && digits(d.phone).length < 10, 'Ten digits')}>
            <input className="ui-input" type="tel" value={d.phone} onChange={(e) => sec.set('phone', e.target.value)} />
          </Field>
          <Field label="Time zone">
            <select className="ui-input" value={d.timeZone} onChange={(e) => sec.set('timeZone', e.target.value)}>
              {TIME_ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
        </div>
      </Group>
      <Group title="Account" about="Quote these when you contact RunTruck support.">
        <dl className="set-ids">
          <div><dt>Account ID</dt><dd>{USER.memberId}</dd></div>
          <div><dt>Company ID</dt><dd>{USER.companyId}</dd></div>
        </dl>
      </Group>
      <SaveBar dirty={sec.dirty} savedAt={sec.savedAt} onSave={save} onDiscard={sec.discard} problems={sec.tried ? problems : undefined} />
    </>
  );
}

function Company() {
  const sec = useSection('company');
  const d = sec.draft;
  const problems = [
    !d.name.trim() && 'Company name is required',
    !d.legal.trim() && 'Legal name is required',
    d.dot.trim() !== '' && !/^\d{5,8}$/.test(digits(d.dot)) && 'USDOT is 5–8 digits',
    d.mc.trim() !== '' && !/^\d{5,7}$/.test(digits(d.mc)) && 'MC is 5–7 digits',
    d.ein.trim() !== '' && digits(d.ein).length !== 9 && 'EIN is 9 digits',
    !STATE.test(d.state.trim()) && 'Two-letter state',
    !isEmail(d.email) && 'Enter a valid billing email',
  ].filter(Boolean) as string[];
  return (
    <>
      <Group title="Business" about="Printed on the invoice letterhead and footer, and in email signatures.">
        <div className="ui-form-grid">
          <Field label="Company name" required help="How customers know you." error={err(sec.tried, !d.name.trim(), 'Required')}>
            <input className="ui-input" value={d.name} onChange={(e) => sec.set('name', e.target.value)} />
          </Field>
          <Field label="Legal name" required error={err(sec.tried, !d.legal.trim(), 'Required')}>
            <input className="ui-input" value={d.legal} onChange={(e) => sec.set('legal', e.target.value)} placeholder="e.g. Sunridge Freight LLC" />
          </Field>
          <Field label="USDOT number" error={err(sec.tried, d.dot.trim() !== '' && !/^\d{5,8}$/.test(digits(d.dot)), '5–8 digits')}>
            <input className="ui-input" inputMode="numeric" value={d.dot} onChange={(e) => sec.set('dot', digits(e.target.value))} />
          </Field>
          <Field label="MC number" error={err(sec.tried, d.mc.trim() !== '' && !/^\d{5,7}$/.test(digits(d.mc)), '5–7 digits')}>
            <input className="ui-input" inputMode="numeric" value={d.mc} onChange={(e) => sec.set('mc', digits(e.target.value))} />
          </Field>
          <Field label="EIN" help="For W-9 requests. Not printed on invoices." error={err(sec.tried, d.ein.trim() !== '' && digits(d.ein).length !== 9, '9 digits')}>
            <input className="ui-input" value={d.ein} onChange={(e) => sec.set('ein', e.target.value)} placeholder="12-3456789" />
          </Field>
          <Field label="Website">
            <input className="ui-input" value={d.website} onChange={(e) => sec.set('website', e.target.value)} placeholder="yourcompany.com" />
          </Field>
        </div>
      </Group>
      <Group title="Address and contact" about="Where the company is, and how customers reach billing.">
        <div className="ui-form-grid">
          <Field label="Street address" wide>
            <input className="ui-input" value={d.street} onChange={(e) => sec.set('street', e.target.value)} />
          </Field>
          <Field label="City">
            <input className="ui-input" value={d.city} onChange={(e) => sec.set('city', e.target.value)} />
          </Field>
          <Field label="State" required error={err(sec.tried, !STATE.test(d.state.trim()), 'Two letters')}>
            <input className="ui-input" maxLength={2} value={d.state} onChange={(e) => sec.set('state', e.target.value.toUpperCase())} />
          </Field>
          <Field label="ZIP">
            <input className="ui-input" value={d.zip} onChange={(e) => sec.set('zip', e.target.value)} />
          </Field>
          <Field label="Main phone">
            <input className="ui-input" type="tel" value={d.phone} onChange={(e) => sec.set('phone', e.target.value)} />
          </Field>
          <Field label="Billing email" required wide help="Printed on invoices; customers reply here." error={err(sec.tried, !isEmail(d.email), 'Enter a valid email')}>
            <input className="ui-input" type="email" value={d.email} onChange={(e) => sec.set('email', e.target.value)} />
          </Field>
        </div>
        <div className="set-preview">
          <span className="set-preview-mark">{d.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
          <div>
            <strong>{d.legal || d.name}</strong>
            <div className="ui-stop-meta">{[d.street, [d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')}</div>
            <div className="ui-stop-meta">{[d.phone, d.email, d.website].filter(Boolean).join(' · ')}</div>
            <div className="ui-stop-meta">{[d.dot && `USDOT ${d.dot}`, d.mc && `MC ${d.mc}`].filter(Boolean).join(' · ')}</div>
          </div>
          <span className="set-preview-tag">Invoice letterhead</span>
        </div>
      </Group>
      <SaveBar dirty={sec.dirty} savedAt={sec.savedAt} onSave={() => sec.save(problems.length === 0)} onDiscard={sec.discard} problems={sec.tried ? problems : undefined} />
    </>
  );
}

function Invoicing() {
  const { invoices } = useAppShell();
  const sec = useSection('invoicing');
  const d = sec.draft;
  const pct = (v: string, max: number) => v.trim() === '' || (Number(v) >= 0 && Number(v) <= max);
  const problems = [
    !/^[A-Za-z0-9-]{0,8}$/.test(d.prefix) && 'Prefix: up to 8 letters, digits or dashes',
    !(Number(d.startAt) >= 1) && 'Start number must be 1 or more',
    !pct(d.fscPct, 100) && 'Fuel surcharge 0–100%',
    !pct(d.lateFeePct, 10) && 'Late fee 0–10% a month',
    d.accountLast4 !== '' && !/^\d{4}$/.test(d.accountLast4) && 'Account: last 4 digits',
    d.factoringEmail.trim() !== '' && !isEmail(d.factoringEmail) && 'Factoring email is not valid',
  ].filter(Boolean) as string[];
  // What the next invoice would be numbered with the prefix and start typed here.
  const nextNo = nextInvoiceId(invoices, d.prefix, d.startAt);
  const sample = invoices.find((i) => !i.draft) ?? invoices[0];
  return (
    <>
      <Group title="Invoice numbers and terms">
        <div className="ui-form-grid">
          <Field label="Number prefix" help={`Next invoice: ${nextNo}`} error={err(sec.tried, !/^[A-Za-z0-9-]{0,8}$/.test(d.prefix), 'Up to 8 letters, digits or dashes')}>
            <input className="ui-input" value={d.prefix} onChange={(e) => sec.set('prefix', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Start numbering at" help="Only used when it is higher than your last invoice." error={err(sec.tried, !(Number(d.startAt) >= 1), '1 or more')}>
            <input className="ui-input" inputMode="numeric" value={d.startAt} onChange={(e) => sec.set('startAt', digits(e.target.value))} />
          </Field>
          <Field label="Default payment terms" help="For customers without their own terms.">
            <select className="ui-input" value={d.defaultTerms} onChange={(e) => sec.set('defaultTerms', e.target.value)}>
              {TERMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Fuel surcharge (%)" help="Split out of each load's rate as its own line. 0 to leave it in line haul." error={err(sec.tried, !pct(d.fscPct, 100), '0–100')}>
            <input className="ui-input" inputMode="decimal" value={d.fscPct} onChange={(e) => sec.set('fscPct', e.target.value)} />
          </Field>
          <Field label="Late fee (% per month)" help="Printed on invoices and suggested in reminders. 0 for none." error={err(sec.tried, !pct(d.lateFeePct, 10), '0–10')}>
            <input className="ui-input" inputMode="decimal" value={d.lateFeePct} onChange={(e) => sec.set('lateFeePct', e.target.value)} />
          </Field>
        </div>
      </Group>
      <Group title="How customers pay you" about="Printed in the How to pay box on every invoice and used in emails.">
        <div className="ui-form-grid">
          <Field label="Bank name">
            <input className="ui-input" value={d.bank} onChange={(e) => sec.set('bank', e.target.value)} />
          </Field>
          <Field label="Account — last 4 digits" help="Only the last four are ever shown." error={err(sec.tried, d.accountLast4 !== '' && !/^\d{4}$/.test(d.accountLast4), '4 digits')}>
            <input className="ui-input" inputMode="numeric" maxLength={4} value={d.accountLast4} onChange={(e) => sec.set('accountLast4', digits(e.target.value))} />
          </Field>
          <Field label="Remit-to address for checks" wide>
            <input className="ui-input" value={d.remit} onChange={(e) => sec.set('remit', e.target.value)} />
          </Field>
          <Field label="Payment note" wide help="Printed under the payment details.">
            <input className="ui-input" value={d.paymentNote} onChange={(e) => sec.set('paymentNote', e.target.value)} />
          </Field>
          <Field label="Invoice footer line" wide>
            <input className="ui-input" value={d.footer} onChange={(e) => sec.set('footer', e.target.value)} />
          </Field>
        </div>
      </Group>
      <Group title="Factoring" about="The factoring company batches can be sent to.">
        <div className="ui-form-grid">
          <Field label="Factoring company">
            <input className="ui-input" value={d.factoringName} onChange={(e) => sec.set('factoringName', e.target.value)} />
          </Field>
          <Field label="Submission email" error={err(sec.tried, d.factoringEmail.trim() !== '' && !isEmail(d.factoringEmail), 'Enter a valid email')}>
            <input className="ui-input" type="email" value={d.factoringEmail} onChange={(e) => sec.set('factoringEmail', e.target.value)} />
          </Field>
        </div>
      </Group>
      {sample && (
        <div className="set-inline-action">
          <button type="button" className="ui-btn" disabled={sec.dirty} onClick={() => openPdf(invoiceDoc(sample))}>Preview an invoice PDF ↗</button>
          <span className="ui-stop-meta">{sec.dirty ? 'Save first to see your changes.' : `Uses ${sample.id} with your saved settings.`}</span>
        </div>
      )}
      <SaveBar dirty={sec.dirty} savedAt={sec.savedAt} onSave={() => sec.save(problems.length === 0)} onDiscard={sec.discard} problems={sec.tried ? problems : undefined} />
    </>
  );
}

const INVOICE_VARS = ['invoice', 'customer', 'amount', 'due', 'terms', 'loads', 'route', 'reference', 'payment', 'sender', 'company', 'phone', 'email'];
const REMINDER_VARS = ['customer', 'invoices', 'balance', 'payment', 'sender', 'company', 'phone', 'email'];
const TEXT_VARS = ['company', 'count', 'balance', 'phone', 'customer'];

function Messages() {
  const { invoices } = useAppShell();
  const sec = useSection('messages');
  const d = sec.draft;
  const [show, setShow] = useState<'Invoice email' | 'Reminder email' | 'Text message'>('Invoice email');
  const sample = invoices.find((i) => !i.draft) ?? invoices[0];
  const vars = (list: string[]) => <div className="set-vars">{list.map((v) => <code key={v}>{`{${v}}`}</code>)}</div>;
  const reset = (k: keyof Settings['messages']) => sec.set(k, DEFAULT_SETTINGS.messages[k]);
  const problems = [!d.invoiceSubject.trim() && 'Invoice subject is empty', !d.invoiceBody.trim() && 'Invoice email is empty', !d.reminderBody.trim() && 'Reminder email is empty'].filter(Boolean) as string[];

  // What the saved-or-draft template produces for a real invoice.
  let preview = '';
  if (sample) {
    if (show === 'Invoice email') {
      const v = {
        ...senderVars(), invoice: sample.id, customer: sample.customer, amount: usd(invoiceTotal(sample)), due: fmtDate(sample.due), terms: sample.terms,
        loads: `${sample.loads.length > 1 ? 'loads' : 'load'} ${sample.loads.join(', ')}`, route: sample.route ? ` (${sample.route.replace(/→/g, 'to')})` : '',
        reference: sample.ref,
      };
      preview = `Subject: ${fillTemplate(d.invoiceSubject, v)}\n\n${fillTemplate(d.invoiceBody, v)}`;
    } else if (show === 'Reminder email') {
      const amount = usd(invoiceTotal(sample));
      preview = fillTemplate(d.reminderBody, { ...senderVars(), customer: sample.customer, invoices: `• ${sample.id} · due ${fmtDate(sample.due)} · ${amount}`, balance: amount });
    } else {
      preview = fillTemplate(d.reminderText, { ...senderVars(), count: 'invoice INV-8821', balance: usd(2180), customer: sample.customer });
    }
  }

  return (
    <>
      <Group title="Invoice email" about="Filled in when you email an invoice. Words in braces are replaced for each invoice.">
        <div className="ui-form-grid">
          <Field label="Subject" wide error={err(sec.tried, !d.invoiceSubject.trim(), 'Required')}>
            <input className="ui-input" value={d.invoiceSubject} onChange={(e) => sec.set('invoiceSubject', e.target.value)} />
          </Field>
          <Field label="Message" wide error={err(sec.tried, !d.invoiceBody.trim(), 'Required')}>
            <textarea className="ui-input" rows={10} value={d.invoiceBody} onChange={(e) => sec.set('invoiceBody', e.target.value)} />
          </Field>
        </div>
        {vars(INVOICE_VARS)}
        <button type="button" className="ui-link" onClick={() => { reset('invoiceSubject'); reset('invoiceBody'); }}>Reset to default</button>
      </Group>
      <Group title="Past-due reminder" about="The email Send reminders starts from, and the text message.">
        <div className="ui-form-grid">
          <Field label="Reminder email" wide error={err(sec.tried, !d.reminderBody.trim(), 'Required')}>
            <textarea className="ui-input" rows={10} value={d.reminderBody} onChange={(e) => sec.set('reminderBody', e.target.value)} />
          </Field>
        </div>
        {vars(REMINDER_VARS)}
        <div className="ui-form-grid" style={{ marginTop: 14 }}>
          <Field label="Reminder text message" wide help={`${fillTemplate(d.reminderText, { ...senderVars(), count: '2 invoices', balance: '$8,099.70', customer: 'Sierra Ag Partners' }).length} characters with a typical balance.`}>
            <input className="ui-input" value={d.reminderText} onChange={(e) => sec.set('reminderText', e.target.value)} />
          </Field>
        </div>
        {vars(TEXT_VARS)}
        <button type="button" className="ui-link" onClick={() => { reset('reminderBody'); reset('reminderText'); }}>Reset to default</button>
      </Group>
      {sample && (
        <Group title="Preview" about={`With ${sample.id} for ${sample.customer}.`}>
          <Segmented options={['Invoice email', 'Reminder email', 'Text message'] as const} value={show} onChange={setShow} label="Preview" />
          <pre className="set-mail">{preview}</pre>
        </Group>
      )}
      <SaveBar dirty={sec.dirty} savedAt={sec.savedAt} onSave={() => sec.save(problems.length === 0)} onDiscard={sec.discard} problems={sec.tried ? problems : undefined} />
    </>
  );
}

function Operations() {
  const sec = useSection('operations');
  const d = sec.draft;
  const num = (v: string, lo: number, hi: number) => v.trim() !== '' && Number(v) >= lo && Number(v) <= hi;
  const terminals = d.terminals;
  const problems = [
    terminals.filter((t) => t.trim()).length === 0 && 'Add at least one terminal',
    new Set(terminals.map((t) => t.trim().toLowerCase())).size !== terminals.length && 'Terminal names must be different',
    !num(d.hosWarnHours, 0, 11) && 'Hours warning 0–11',
    !num(d.renewWindowDays, 1, 365) && 'Renewal window 1–365 days',
    !num(d.unbilledDays, 0, 60) && 'Not invoiced after 0–60 days',
    !num(d.detentionFreeHours, 0, 24) && 'Free time 0–24 hours',
    !num(d.detentionRate, 0, 1000) && 'Detention rate 0–1,000',
  ].filter(Boolean) as string[];
  return (
    <>
      <Group title="Home terminals" about="The yards drivers and trucks are based at. Offered on the driver and truck forms.">
        <div className="set-list">
          {terminals.map((t, i) => (
            <div key={i} className="set-list-row">
              <input className="ui-input" aria-label={`Terminal ${i + 1}`} value={t} onChange={(e) => sec.set('terminals', terminals.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="ui-icon-btn" aria-label={`Remove ${t || 'terminal'}`} disabled={terminals.length === 1} onClick={() => sec.set('terminals', terminals.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="ui-btn" style={{ alignSelf: 'flex-start' }} onClick={() => sec.set('terminals', [...terminals, ''])}>+ Add terminal</button>
        <p className="ui-stop-meta">Renaming a terminal does not change drivers and trucks already set to the old name.</p>
      </Group>
      <Group title="Warnings" about="When RunTruck flags something on the Drivers page, Safety and the dashboard.">
        <div className="ui-form-grid">
          <Field label="Hours-of-service warning (hours left)" help="On-duty drivers below this are “at risk”." error={err(sec.tried, !num(d.hosWarnHours, 0, 11), '0–11')}>
            <input className="ui-input" inputMode="decimal" value={d.hosWarnHours} onChange={(e) => sec.set('hosWarnHours', e.target.value)} />
          </Field>
          <Field label="Document renewal window (days)" help="Driver documents due within this are “expiring”." error={err(sec.tried, !num(d.renewWindowDays, 1, 365), '1–365')}>
            <input className="ui-input" inputMode="numeric" value={d.renewWindowDays} onChange={(e) => sec.set('renewWindowDays', digits(e.target.value))} />
          </Field>
          <Field label="Flag loads not invoiced after (days)" help="Delivered loads older than this show on Needs attention." error={err(sec.tried, !num(d.unbilledDays, 0, 60), '0–60')}>
            <input className="ui-input" inputMode="numeric" value={d.unbilledDays} onChange={(e) => sec.set('unbilledDays', digits(e.target.value))} />
          </Field>
        </div>
      </Group>
      <Group title="Detention" about="Starting values for new facilities and the invoice’s + Detention charge.">
        <div className="ui-form-grid">
          <Field label="Free time (hours)" error={err(sec.tried, !num(d.detentionFreeHours, 0, 24), '0–24')}>
            <input className="ui-input" inputMode="decimal" value={d.detentionFreeHours} onChange={(e) => sec.set('detentionFreeHours', e.target.value)} />
          </Field>
          <Field label="Rate ($ per hour)" error={err(sec.tried, !num(d.detentionRate, 0, 1000), '0–1,000')}>
            <input className="ui-input" inputMode="decimal" value={d.detentionRate} onChange={(e) => sec.set('detentionRate', e.target.value)} />
          </Field>
        </div>
      </Group>
      <SaveBar
        dirty={sec.dirty} savedAt={sec.savedAt} onDiscard={sec.discard} problems={sec.tried ? problems : undefined}
        onSave={() => sec.save(problems.length === 0, (next) => ({ ...next, operations: { ...next.operations, terminals: next.operations.terminals.map((t) => t.trim()) } }))}
      />
    </>
  );
}

function Alerts() {
  const [s, update] = useSettings();
  const on = ALERTS.filter((a) => s.alerts[a.key]).length;
  return (
    <Group title="Needs attention" about={`Which items the dashboard lists. ${on} of ${ALERTS.length} on. Changes apply straight away.`}>
      <div className="dash-opts">
        {ALERTS.map((a) => (
          <div key={a.key} className="dash-opt">
            <div><strong>{a.label}</strong><span>{a.about}</span></div>
            <Switch on={s.alerts[a.key]} label={a.label} onChange={(v) => update((p) => ({ ...p, alerts: { ...p.alerts, [a.key]: v } }))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="ui-btn" onClick={() => update((p) => ({ ...p, alerts: Object.fromEntries(ALERTS.map((a) => [a.key, true])) as Settings['alerts'] }))}>Turn all on</button>
        <Link className="ui-btn" to="/app/dashboard">See the dashboard</Link>
      </div>
    </Group>
  );
}

function Team() {
  const [s, update] = useSettings();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [tried, setTried] = useState(false);
  const me = (m: TeamMember) => m.email.toLowerCase() === s.profile.email.toLowerCase();
  const admins = s.team.filter((m) => m.active && m.role === 'Admin');
  const save = (list: TeamMember[]) => update((p) => ({ ...p, team: list }));
  const blank = (): TeamMember => ({ id: `U-${Date.now().toString(36)}`, name: '', email: '', phone: '', role: 'Dispatcher', active: true });
  const e = editing;
  const taken = e ? s.team.some((m) => m.id !== e.id && m.email.toLowerCase() === e.email.trim().toLowerCase()) : false;
  const losingLastAdmin = (next: TeamMember) => {
    const before = s.team.find((m) => m.id === next.id);
    return before?.role === 'Admin' && before.active && (next.role !== 'Admin' || !next.active) && admins.length === 1;
  };
  const problems = e ? [
    !e.name.trim() && 'Name is required',
    !isEmail(e.email) && 'Enter a valid email',
    taken && 'Someone already has this email',
    losingLastAdmin(e) && 'Keep at least one active Admin',
  ].filter(Boolean) as string[] : [];

  const commit = () => {
    if (!e) return;
    setTried(true);
    if (problems.length) return;
    const clean = { ...e, name: e.name.trim(), email: e.email.trim() };
    save(s.team.some((m) => m.id === e.id) ? s.team.map((m) => (m.id === e.id ? clean : m)) : [...s.team, clean]);
    setEditing(null);
    setTried(false);
  };

  return (
    <>
      <Group title={`Team · ${s.team.filter((m) => m.active).length} active`} about="Admins and Dispatchers are offered as the dispatcher on driver records.">
        <div className="set-team">
          {s.team.map((m) => (
            <div key={m.id} className={`set-team-row${m.active ? '' : ' is-off'}`}>
              <span className="ui-avatar" aria-hidden="true">{m.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
              <div className="set-team-text">
                <strong>{m.name}{me(m) && <span className="set-you">You</span>}</strong>
                <span className="ui-stop-meta">{[m.email, m.phone].filter(Boolean).join(' · ')}</span>
              </div>
              <span className="ui-chip ui-chip-blue">{m.role}</span>
              {!m.active && <span className="ui-chip ui-chip-gray">Deactivated</span>}
              <button type="button" className="ui-link" onClick={() => { setEditing({ ...m }); setTried(false); }}>Edit</button>
              {!me(m) && (
                <button
                  type="button" className="ui-link" style={{ color: 'var(--ui-red)' }}
                  disabled={m.role === 'Admin' && m.active && admins.length === 1}
                  onClick={() => { if (window.confirm(`Remove ${m.name} from the team?`)) save(s.team.filter((x) => x.id !== m.id)); }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {!editing && <button type="button" className="ui-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setEditing(blank()); setTried(false); }}>+ Add team member</button>}
        {e && (
          <div className="ui-panel set-member-form">
            <div className="ui-label" style={{ marginBottom: 12 }}>{s.team.some((m) => m.id === e.id) ? `Edit ${e.name || 'member'}` : 'New team member'}</div>
            <div className="ui-form-grid">
              <Field label="Name" required error={err(tried, !e.name.trim(), 'Required')}>
                <input className="ui-input" value={e.name} onChange={(ev) => setEditing({ ...e, name: ev.target.value })} />
              </Field>
              <Field label="Email" required error={err(tried, !isEmail(e.email) || taken, taken ? 'Already on the team' : 'Enter a valid email')}>
                <input className="ui-input" type="email" value={e.email} onChange={(ev) => setEditing({ ...e, email: ev.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="ui-input" type="tel" value={e.phone} onChange={(ev) => setEditing({ ...e, phone: ev.target.value })} />
              </Field>
              <Field label="Role" help={ROLE_ABOUT[e.role]}>
                <select className="ui-input" value={e.role} onChange={(ev) => setEditing({ ...e, role: ev.target.value as TeamRole })}>
                  {TEAM_ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            <label className="ui-check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={e.active} onChange={(ev) => setEditing({ ...e, active: ev.target.checked })} disabled={me(e)} />
              Active
            </label>
            {tried && problems.length > 0 && <div className="ui-errors" style={{ marginTop: 12 }}>{problems.join(' · ')}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className="ui-btn ui-btn-primary" onClick={commit}>{s.team.some((m) => m.id === e.id) ? 'Save member' : 'Add member'}</button>
              <button type="button" className="ui-btn" onClick={() => { setEditing(null); setTried(false); }}>Cancel</button>
              {isEmail(e.email) && !me(e) && (
                <button
                  type="button" className="ui-btn"
                  onClick={() => launch(mailtoHref(e.email, `Join ${s.company.name} on RunTruck`, `Hi ${e.name.split(' ')[0] || 'there'},\n\nI've added you to ${s.company.name} on RunTruck as ${e.role}.\n\n${s.profile.name}`))}
                >
                  Email an invite ↗
                </button>
              )}
            </div>
          </div>
        )}
      </Group>
      <Group title="Roles">
        <dl className="set-roles">
          {TEAM_ROLES.map((r) => <div key={r}><dt>{r}</dt><dd>{ROLE_ABOUT[r]}</dd></div>)}
        </dl>
      </Group>
    </>
  );
}

function Security() {
  const session = currentSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [wrong, setWrong] = useState(false);
  const weak = passwordProblems(next);
  const mismatch = again !== next;
  const changed = passwordChangedOn();
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  const submit = async () => {
    setTried(true);
    setDone('');
    setWrong(false);
    if (!current || weak.length || mismatch) return;
    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);
    if (result === 'wrong-current') { setWrong(true); return; }
    if (result === 'not-saved') { setDone('The new password could not be saved: this browser is blocking or out of storage. Your password is unchanged.'); return; }
    if (result === 'ok') {
      setCurrent(''); setNext(''); setAgain(''); setTried(false);
      setDone('Password changed. Use it the next time you log in on this browser.');
    }
  };

  return (
    <>
      <Group title="Signed in" about={isSuperAdmin() ? 'A RunTruck super admin: every part of RunTruck, plus Developer.' : `Your ${me()?.type ?? 'RunTruck'} account at ${USER.company}.`}>
        <dl className="set-ids">
          <div><dt>Email</dt><dd>{session?.email || accountEmail() || '—'}</dd></div>
          <div><dt>Company ID</dt><dd>{session?.companyId ?? '—'}</dd></div>
          <div><dt>Account ID</dt><dd>{session?.memberId ?? '—'}</dd></div>
          <div><dt>Account type</dt><dd>{me()?.type ?? '—'}</dd></div>
          <div><dt>Signed in</dt><dd>{when(session?.started)}</dd></div>
          {canLogOut()
            ? <div><dt>{session?.remember ? 'Stays signed in until' : 'Signs out'}</dt><dd>{session?.remember ? when(session.expires) : 'When the browser closes'}</dd></div>
            : <div><dt>Login</dt><dd>Switched off</dd></div>}
        </dl>
        {canLogOut() && <div><button type="button" className="ui-btn" onClick={logOutAndLeave}>Log out</button></div>}
      </Group>
      {isSuperAdmin() ? (
        <LoginEmail when={when} />
      ) : (
        <Group title="Login email" about={`You log in with ${accountEmail()}.`}>
          <div className="ui-note">To change your login email, contact a RunTruck super admin. You can change your password below.</div>
        </Group>
      )}
      <Group title="Change password" about={`At least ${MIN_PASSWORD} characters, with letters and a number. Last changed: ${changed ? when(changed) : 'never (starting password)'}.`}>
        <div className="ui-form-grid">
          <Field label="Current password" required wide error={(tried && !current && 'Required') || (wrong && 'That is not your current password')}>
            <input className="ui-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" required error={tried && weak.length > 0 && weak.join(' · ')}>
            <input className="ui-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repeat new password" required error={tried && mismatch && 'Does not match'}>
            <input className="ui-input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
        </div>
        <div><button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Change password'}</button></div>
        {done && <div className="ui-note">{done}</div>}
        <p className="ui-stop-meta">RunTruck has no server yet: accounts and passwords are kept on this browser until they move to RunTruck’s servers.</p>
      </Group>
    </>
  );
}

// The super admin changes the login email here (and only here), confirming
// with the current password.
function LoginEmail({ when }: { when: (iso?: string) => string }) {
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState('');
  const login = accountEmail();
  const changed = loginEmailChangedOn();
  const same = email.trim().toLowerCase() === login.toLowerCase();

  const submit = async () => {
    setTried(true);
    setDone('');
    setWrong(false);
    if (!isEmail(email) || same || !current) return;
    setBusy(true);
    const result = await changeLoginEmail(current, email);
    setBusy(false);
    if (result === 'wrong-current') { setWrong(true); return; }
    if (result === 'not-saved') { setDone('The new login email could not be saved: this browser is blocking or out of storage. Your login email is unchanged.'); return; }
    if (result === 'taken') { setDone('Another account already logs in with that email.'); return; }
    if (result === 'ok') {
      setDone(`Login email changed. Log in with ${email.trim()} from now on.`);
      setEmail(''); setCurrent(''); setTried(false);
    }
  };

  return (
    <Group title="Login email" about={`You log in with ${login}. Last changed: ${changed ? when(changed) : 'never (original email)'}.`}>
      <div className="ui-form-grid">
        <Field label="New login email" required wide error={tried && ((!isEmail(email) && 'Enter a valid email') || (same && 'That is already your login email'))}>
          <input className="ui-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Current password" required wide help="To confirm it’s you." error={(tried && !current && 'Required') || (wrong && 'That is not your current password')}>
          <input className="ui-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      </div>
      <div><button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Change login email'}</button></div>
      {done && <div className="ui-note">{done}</div>}
      <p className="ui-stop-meta">Your contact email in Profile stays as it is. Like the password, the login email is kept on this browser until accounts move to RunTruck’s servers.</p>
    </Group>
  );
}

function Appearance() {
  const [s, update] = useSettings();
  const a = s.appearance;
  const set = <K extends keyof Settings['appearance']>(k: K, v: Settings['appearance'][K]) =>
    update((p) => ({ ...p, appearance: { ...p.appearance, [k]: v } as Settings['appearance'] }));
  const ACCENTS: Accent[] = ['Blue', 'Teal', 'Green', 'Purple', 'Orange', 'Slate'];
  return (
    <Group title="Look and feel" about="Changes apply straight away, on this browser.">
      <div className="dash-opts">
        <div className="dash-opt">
          <div><strong>Theme</strong><span>System follows your device’s light or dark setting.</span></div>
          <Segmented options={['Light', 'Dark', 'System'] as ThemeChoice[]} value={a.theme} onChange={(v) => set('theme', v)} label="Theme" />
        </div>
        <div className="dash-opt">
          <div><strong>Accent colour</strong><span>Buttons, links, highlights and charts.</span></div>
          <div className="set-swatches" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={a.accent === c} aria-label={c} title={c} className={`set-swatch is-${c.toLowerCase()}${a.accent === c ? ' is-on' : ''}`} onClick={() => set('accent', c)} />
            ))}
          </div>
        </div>
        <div className="dash-opt">
          <div><strong>Text size</strong><span>Scales the whole app.</span></div>
          <Segmented options={['Small', 'Default', 'Large'] as TextSize[]} value={a.textSize} onChange={(v) => set('textSize', v)} label="Text size" />
        </div>
        <div className="dash-opt">
          <div><strong>Table spacing</strong><span>Compact fits more rows on screen.</span></div>
          <Segmented options={['Comfortable', 'Compact'] as Density[]} value={a.density} onChange={(v) => set('density', v)} label="Table spacing" />
        </div>
        <div className="dash-opt">
          <div><strong>Start page</strong><span>Where RunTruck opens.</span></div>
          <select className="ui-input" style={{ width: 180 }} value={a.startPage} onChange={(e) => set('startPage', e.target.value as Settings['appearance']['startPage'])}>
            {START_PAGES.filter((p) => can(p.key)).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>
    </Group>
  );
}

function DataSection() {
  const { loads, drivers, trucks, trailers, facilities, invoices, batches } = useAppShell();
  const [, update] = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  // Logins (session, passwords, accounts), RunTruck's client register and
  // which release each client runs are never backed up, restored or reset
  // here; nor is any other company's data, or this device's error log.
  const isLogin = (k: string) => k === 'runtruck-session' || k === 'runtruck-login-fails'
    || /-(auth|login-email|accounts|account-ids|companies|company-ids|release-state|deployments|errors)$/.test(k);
  const keys = () => Object.keys(localStorage).filter((k) => k.startsWith('runtruck-') && isOwnKey(k) && !isLogin(k));

  const exportAll = () => {
    const data: Record<string, unknown> = {};
    for (const k of keys()) {
      try { data[k] = JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { data[k] = localStorage.getItem(k); }
    }
    const blob = new Blob([JSON.stringify({ app: 'RunTruck', exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `runtruck-backup-${todayIso()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMessage('Backup downloaded.');
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; data?: Record<string, unknown> };
      const entries = Object.entries(parsed.data ?? {}).filter(([k]) => k.startsWith('runtruck-') && !isLogin(k) && isOwnKey(currentKey(k)));
      if (parsed.app !== 'RunTruck' || entries.length === 0) {
        setMessage('That file is not a backup of this company’s RunTruck.');
        return;
      }
      if (!window.confirm(`Replace what is stored in this browser with the backup (${entries.length} parts)? The page will reload.`)) return;
      // Keep what is there now until the backup is fully written: if the
      // browser runs out of room part-way, everything goes back as it was.
      const before = keys().map((k) => [k, localStorage.getItem(k)] as const);
      const written: string[] = [];
      try {
        for (const [k] of before) localStorage.removeItem(k);
        for (const [k, v] of entries) {
          localStorage.setItem(currentKey(k), typeof v === 'string' ? v : JSON.stringify(v));
          written.push(currentKey(k));
        }
      } catch (err) {
        for (const k of written) localStorage.removeItem(k);
        for (const [k, v] of before) if (v !== null) localStorage.setItem(k, v);
        reportError(err, { kind: 'storage', where: 'Restore from backup' });
        setMessage('The backup did not fit in this browser’s storage. Nothing was changed.');
        return;
      }
      window.location.reload();
    } catch {
      setMessage('Could not read that file.');
    }
  };

  const resetRecords = () => {
    const everything = 'loads, fleet, facilities, customers, invoices, batches, bills, payroll, HR, safety and planner records, and the dashboard layout';
    if (!window.confirm(`${IS_DEMO ? `Put every record (${everything}) back to the demo data` : `Delete every record: ${everything}`}? This cannot be undone${IS_DEMO ? '' : '; download a backup first if you may need them'}. Your settings are kept. The page will reload.`)) return;
    // Settings and RunTruck's client companies are not demo data: they stay.
    const keep = (k: string) => k.endsWith('-settings') || k === 'runtruck-theme' || k.endsWith('-companies') || k.endsWith('-company-ids');
    for (const k of keys()) if (!keep(k)) localStorage.removeItem(k);
    window.location.reload();
  };

  const counts: [string, number][] = [
    ['Loads', loads.length], ['Drivers', drivers.length], ['Trucks', trucks.length], ['Trailers', trailers.length],
    ['Facilities', facilities.length], ['Invoices', invoices.length], ['Batches', batches.length],
  ];

  return (
    <>
      <Group title="Stored in this browser" about="RunTruck keeps your records in this browser until accounts and cloud sync arrive. Back up before clearing browser data or switching computers.">
        <div className="set-counts">
          {counts.map(([k, n]) => <div key={k}><strong>{n}</strong><span>{k}</span></div>)}
        </div>
      </Group>
      <Group title="Back up and restore">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="ui-btn ui-btn-primary" onClick={exportAll}>Download backup</button>
          <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>Restore from backup…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </div>
        {message && <div className="ui-note">{message}</div>}
      </Group>
      <Group title="Reset">
        <div className="dash-opts">
          <div className="dash-opt">
            <div><strong>{IS_DEMO ? 'Reset records to the demo data' : 'Clear all records'}</strong><span>Loads, fleet, facilities, invoices, batches, dashboard layout. Settings stay.</span></div>
            <button type="button" className="ui-btn ui-btn-danger" onClick={resetRecords}>Reset records</button>
          </div>
          <div className="dash-opt">
            <div><strong>Reset all settings</strong><span>Everything on this page back to how RunTruck started.</span></div>
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => { if (window.confirm('Reset every setting to its default?')) { update(() => defaultSettings()); setMessage('Settings reset.'); } }}>Reset settings</button>
          </div>
        </div>
      </Group>
    </>
  );
}

// — the page —

export function SettingsPage() {
  const { section = 'profile' } = useParams();
  const navigate = useNavigate();
  // Profile, Security and Appearance are everyone's; company settings need permission.
  // Export data arrived in release 1.2.
  const allowed = SECTIONS.filter((s) => can(PERSONAL_SETTINGS.includes(s.key) ? 'settings' : `settings/${s.key}`) && (s.key !== 'export' || isLive('settings-export')));
  const current = allowed.find((s) => s.key === section) ?? allowed[0];
  const body: Record<SectionKey, ReactNode> = {
    profile: <Profile />, company: <Company />, invoicing: <Invoicing />, messages: <Messages />, operations: <Operations />,
    alerts: <Alerts />, team: <Team />, security: <Security />, appearance: <Appearance />, export: <ExportPanel />, data: <DataSection />,
  };
  return (
    <div className="set-page">
      <nav className="set-nav" aria-label="Settings sections">
        <div className="set-nav-title">Settings</div>
        {allowed.map((s) => (
          <button
            key={s.key} type="button" className={`set-nav-item${s.key === current.key ? ' is-active' : ''}`}
            aria-current={s.key === current.key ? 'page' : undefined}
            onClick={() => {
              const unsaved = document.querySelector('.set-savebar:not(.is-saved)');
              if (s.key !== current.key && (!unsaved || window.confirm('Leave this section? Unsaved changes will be lost.'))) navigate(`/app/settings/${s.key}`);
            }}
          >
            {s.title}
          </button>
        ))}
      </nav>
      <div className="set-body" key={current.key}>
        <header className="set-head">
          <h2>{current.title}</h2>
          <p>{current.about}</p>
        </header>
        {body[current.key]}
      </div>
    </div>
  );
}

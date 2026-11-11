import { useDeferredValue, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  faAddressCard, faArrowRight, faArrowUpRightFromSquare, faBuilding, faCalendarDays, faCheck, faChevronDown, faCircleCheck, faCircleExclamation,
  faDownload, faExclamation, faEye, faFileInvoiceDollar, faLock, faMagnifyingGlass, faNoteSticky, faPlus, faReceipt, faTriangleExclamation,
  faTruck, faXmark, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { faLightbulb } from '@fortawesome/free-regular-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import {
  CHARGE_TYPES, PAY_METHODS, TERMS, TODAY, addDays, billToFor, billableLoads, draftForLoads, fmtDate, invoiceEmail, invoiceTotal, isLineOfLoad,
  lineAmount, loadLines, nextInvoiceId, shipmentFor, statusOf, termDays, termsFor, usd, type BillTo, type BillableLoad, type InvoiceLine,
  type InvoiceRecord,
} from '../data/invoicing';
import { CUSTOMERS } from '../data/mock';
import { invoiceDoc, invoiceFileName } from '../lib/invoicePdf';
import { downloadPdf, openPdf } from '../lib/pdf';
import { getSettings } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { Fa } from './Fa';
import { Field, isEmail, launch, mailtoHref, useModal } from './FormBits';
import { INV_COUNTED, invoiceRules, requiredCount, type InvSection } from './invoiceRules';
import { hl } from './highlight';
import { Combo, NlConfirm, Req, SecHead } from './nlParts';
import { PdfPages } from './PdfPages';

// New Invoice / Edit invoice (release 1.23), in the Loadpopupv_2 design of
// the New Load popup: one scrolling form in sections with a section menu on
// the left. Where New Load has its load summary, a wider panel shows the
// invoice itself, drawn from the same pages as the PDF the customer gets, and
// updated as the form changes.

const SECTIONS: { id: InvSection; label: string; icon: IconDefinition }[] = [
  { id: 'customer', label: 'Customer & loads', icon: faBuilding },
  { id: 'billto', label: 'Bill to', icon: faAddressCard },
  { id: 'details', label: 'Invoice details', icon: faCalendarDays },
  { id: 'shipment', label: 'Shipment', icon: faTruck },
  { id: 'charges', label: 'Charges', icon: faReceipt },
  { id: 'notes', label: 'Notes', icon: faNoteSticky },
  { id: 'preview', label: 'Preview', icon: faEye },
];

const QUICK = (): { label: string; line: InvoiceLine }[] => [
  { label: 'Detention', line: { kind: 'Detention', description: `Detention beyond ${getSettings().operations.detentionFreeHours} h free time`, qty: '1', rate: getSettings().operations.detentionRate } },
  { label: 'Lumper', line: { kind: 'Lumper', description: 'Lumper receipt attached', qty: '1', rate: '' } },
  { label: 'Stop-off', line: { kind: 'Stop-off', description: 'Additional stop', qty: '1', rate: '100' } },
  { label: 'Discount', line: { kind: 'Discount', description: '', qty: '1', rate: '-50' } },
];

// The preview sits beside the form on wide screens (1280 px and up, where New
// Load shows its summary); on narrower ones it is the last section.
const WIDE = '(min-width: 1280px)';
const subscribeWide = (fn: () => void) => {
  const m = window.matchMedia?.(WIDE);
  m?.addEventListener('change', fn);
  return () => m?.removeEventListener('change', fn);
};
const isWide = () => window.matchMedia?.(WIDE).matches ?? true;
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const later = (fn: () => void) => window.setTimeout(fn, 0);

// The New Invoice / Edit invoice popup. `loadIds` starts a new invoice from
// delivered loads (the Uninvoiced tab's "New invoice").
export function InvoiceDialog({ invoice, loadIds, onClose }: { invoice?: InvoiceRecord; loadIds?: string[]; onClose: () => void }) {
  const { loads, invoices, saveInvoice, deleteInvoice } = useAppShell();
  const { ref, closeNow } = useModal(onClose);
  const scrollRef = useRef<HTMLElement>(null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const queue = useMemo(() => billableLoads(loads, invoices.filter((i) => i.id !== invoice?.id)), [loads, invoices, invoice?.id]);
  const [start] = useState<InvoiceRecord>(() =>
    invoice ? JSON.parse(JSON.stringify(invoice)) : draftForLoads(queue.filter((l) => loadIds?.includes(l.id)), nextInvoiceId(invoices)),
  );
  const [d, setD] = useState<InvoiceRecord>(start);
  const [custText, setCustText] = useState(start.customer);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState<null | 'discard' | 'delete'>(null);
  const [emailing, setEmailing] = useState<InvoiceRecord | null>(null);
  const [current, setCurrent] = useState<InvSection>('customer');

  const isNew = !invoice;
  const issuedAlready = Boolean(invoice && !invoice.draft);
  const sections = SECTIONS.filter((s) => !wide || s.id !== 'preview');
  const lastSection = sections[sections.length - 1].id;
  const dirty = JSON.stringify(d) !== JSON.stringify(start) || custText !== start.customer;
  const total = invoiceTotal(d);

  // — checks —
  const customerPicked = Boolean(d.customer) && custText.trim() === d.customer;
  const rules = invoiceRules(d, { customerPicked });
  const ruleOf = (field: string) => rules.find((r) => r.field === field);
  const errOf = (field: string) => {
    const r = ruleOf(field);
    return r && (submitted || touched.has(field)) ? r : undefined;
  };
  const errFor = (field: string) => {
    const r = errOf(field);
    return r ? <p id={`nl-${field}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>{r.m}</span></p> : null;
  };
  const fieldProps = (field: string) => ({
    id: `nl-${field}`,
    'aria-invalid': (errOf(field) ? 'true' : 'false') as 'true' | 'false',
    'aria-describedby': errOf(field) ? `nl-${field}-err` : undefined,
  });
  const touch = (...fields: string[]) => setTouched((t) => {
    const n = new Set(t);
    fields.forEach((f) => n.add(f));
    return n;
  });
  const onBlurCapture = (e: FocusEvent<HTMLFormElement>) => {
    const id = (e.target as HTMLElement).id;
    if (id.startsWith('nl-')) touch(id.slice(3));
  };

  const counted = INV_COUNTED.map((sec) => {
    const mine = rules.filter((r) => r.section === sec);
    return { sec, miss: mine.length, total: requiredCount(d, sec), err: mine.some((r) => submitted || touched.has(r.field)) };
  });
  const secDone = counted.filter((c) => c.miss === 0).length;
  const remaining = rules.length;

  const statusOfSection = (id: InvSection): ReactNode => {
    if (id === 'preview') return null;
    if (id === 'shipment' || id === 'notes') return <span className="nl-st-opt">Optional</span>;
    const c = counted.find((x) => x.sec === id);
    if (!c || c.miss === 0) return <span className="nl-st-done"><Fa icon={faCheck} /><span className="nl-sr">complete</span></span>;
    if (c.err) return <span className="nl-st-err"><Fa icon={faExclamation} />{c.miss}</span>;
    return <span className="nl-st-count">{Math.max(0, c.total - c.miss)}/{c.total}</span>;
  };

  // — navigation —
  const goTo = (id: InvSection) => {
    const el = document.getElementById(`nl-sec-${id}`);
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const spy = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    let now: InvSection = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById(`nl-sec-${s.id}`);
      if (el && el.offsetTop - sc.scrollTop <= 140) now = s.id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) now = lastSection;
    setCurrent(now);
  };
  const focusField = (field: string) => later(() => {
    const el = document.getElementById(`nl-${field}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  // — changes —
  const setBill = (k: keyof BillTo, v: string) => setD((p) => ({ ...p, billTo: { ...p.billTo, [k]: v } }));
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setD((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const withTerms = (p: InvoiceRecord, terms: string, issued = p.issued) => ({ ...p, terms, issued, due: issued ? addDays(issued, termDays(terms)) : p.due });

  // A different customer starts the billing over: their address and terms,
  // and none of the previous customer's loads.
  const pickCustomer = (c: string) => {
    setCustText(c);
    if (c === d.customer) return;
    setD((p) => ({
      ...withTerms(p, termsFor(c)),
      customer: c,
      billTo: billToFor(c),
      loads: [],
      lines: p.lines.filter((l) => !p.loads.some((id) => isLineOfLoad(l, id))),
    }));
  };

  // Ticking a load adds its rate lines; the shipment block is rebuilt from
  // every ticked load. Unticking removes that load's lines.
  const toggleLoad = (l: BillableLoad, on: boolean) =>
    setD((p) => {
      const ids = on ? [...p.loads, l.id] : p.loads.filter((x) => x !== l.id);
      const picked = queue.filter((q) => ids.includes(q.id));
      return {
        ...p,
        ...(picked.length ? shipmentFor(picked) : {}),
        loads: ids,
        lines: on ? [...p.lines, ...loadLines(l)] : p.lines.filter((x) => !isLineOfLoad(x, l.id)),
      };
    });
  const dropLoad = (id: string) => setD((p) => ({ ...p, loads: p.loads.filter((x) => x !== id), lines: p.lines.filter((x) => !isLineOfLoad(x, id)) }));
  const addLine = (line: InvoiceLine) => {
    setD((p) => ({ ...p, lines: [...p.lines, line] }));
    focusField(`line-${d.lines.length}-${line.kind ? 'rate' : 'kind'}`);
  };
  const removeLine = (i: number) => {
    setD((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));
    focusField(d.lines.length > 1 ? `line-${Math.min(i, d.lines.length - 2)}-kind` : 'btn-add-line');
  };

  // — saving —
  const finalize = (): InvoiceRecord => {
    const text = issuedAlready ? 'Invoice edited' : 'Invoice created';
    // A draft started on an earlier day goes out dated today (and due from
    // today), unless the dates were set by hand here: otherwise the customer
    // would lose the days the draft sat unsent.
    const stale = !issuedAlready && d.issued === start.issued && d.issued < TODAY;
    const dated = stale ? { issued: TODAY, due: d.due === start.due ? addDays(TODAY, termDays(d.terms)) : d.due } : {};
    return { ...d, ...dated, draft: false, history: [...d.history, { date: TODAY, text }] };
  };
  const create = (thenEmail: boolean) => {
    if (rules.length) {
      setSubmitted(true);
      focusField(rules[0].field);
      return;
    }
    const done = finalize();
    saveInvoice(done);
    toast(issuedAlready ? `Invoice ${done.id} saved.` : `Invoice ${done.id} created for ${done.customer}.`);
    if (thenEmail) setEmailing(done);
    else closeNow();
  };
  const saveDraft = () => {
    if (!customerPicked) {
      touch('customer');
      focusField('customer');
      return;
    }
    saveInvoice({ ...d, draft: true, history: d.history.length ? d.history : [{ date: TODAY, text: 'Draft started' }] });
    toast(`Draft ${d.id} saved.`, 'info');
    closeNow();
  };
  const requestClose = () => {
    if (!dirty) return closeNow();
    setConfirm('discard');
  };
  const keepEditing = () => {
    setConfirm(null);
    later(() => document.getElementById('nl-btn-cancel')?.focus());
  };
  const remove = () => {
    deleteInvoice(d.id);
    toast(`Invoice ${d.id} deleted.`, 'info');
    closeNow();
  };

  // — the invoice as the customer gets it —
  // A new invoice or a draft is previewed as it will go out (not stamped DRAFT).
  const previewed = useDeferredValue(d);
  const doc = useMemo(() => invoiceDoc(issuedAlready ? previewed : { ...previewed, draft: false }), [previewed, issuedAlready]);
  const pdfButtons = (
    <div className="inv-pre-btns">
      <button type="button" className="nl-btn-line nl-fbtn" onClick={() => openPdf(doc)}><Fa icon={faArrowUpRightFromSquare} />Open</button>
      <button type="button" className="nl-btn-line nl-fbtn" onClick={() => downloadPdf(doc, invoiceFileName(d))}><Fa icon={faDownload} />Download</button>
    </div>
  );
  const facts = (
    <div className="inv-pre-facts">
      <div><span>Amount due</span><strong>{usd(total)}</strong></div>
      <div><span>Due</span><strong>{fmtDate(d.due)}</strong></div>
      <div><span>Emailed to</span><strong className={d.billTo.email.trim() ? '' : 'is-unset'}>{d.billTo.email.trim() || 'No billing email'}</strong></div>
    </div>
  );

  const mine = queue.filter((q) => q.customer === d.customer);
  const attachedElsewhere = d.loads.filter((id) => !mine.some((q) => q.id === id));
  const podMissing = d.loads.some((id) => mine.find((q) => q.id === id)?.pod === 'Missing');
  const followsTerms = Boolean(d.issued) && d.due === addDays(d.issued, termDays(d.terms));

  const statusLine = remaining === 0
    ? <><Fa icon={faCircleCheck} className="is-ok" /><span className="is-ok-text">{issuedAlready ? 'Ready to save' : 'Ready to create'}</span></>
    : submitted
      ? <><Fa icon={faCircleExclamation} className="is-bad" /><span className="is-bad-text">Fix {remaining} field{remaining > 1 ? 's' : ''} to {issuedAlready ? 'save' : 'create'} this invoice</span></>
      : <><span className="nl-req">*</span><span className="is-left">{remaining} required field{remaining > 1 ? 's' : ''} left</span></>;

  const statusWord = invoice ? statusOf(invoice) : 'Draft';

  return (
    <dialog
      ref={ref}
      className="nl inv"
      aria-labelledby="nl-title"
      aria-describedby="nl-desc"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (confirm) keepEditing();
        else requestClose();
      }}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirm && !emailing) { e.preventDefault(); create(false); }
      }}
    >
      {/* Header */}
      <header className="nl-head">
        <div className="nl-head-left">
          <div className="nl-head-ico"><Fa icon={faFileInvoiceDollar} /></div>
          <div>
            <h1 id="nl-title" tabIndex={-1} className="nl-title">{isNew ? 'Create new invoice' : `${issuedAlready ? 'Edit invoice' : 'Finish draft'} ${d.id}`}</h1>
            <p id="nl-desc" className="nl-desc">
              {isNew ? 'Bill a customer for delivered loads.' : `${statusWord} · ${d.customer || 'no customer yet'}.`} <span className="nl-req">*</span> Required.
            </p>
          </div>
        </div>
        <div className="nl-head-right">
          <div className="nl-progress">
            <div className="nl-progress-row"><span>Progress</span><span>{secDone} of {INV_COUNTED.length} sections</span></div>
            <div className="nl-progress-track" role="progressbar" aria-label="Sections completed" aria-valuemin={0} aria-valuemax={INV_COUNTED.length} aria-valuenow={secDone}>
              <div className="nl-progress-bar" style={{ width: `${(secDone / INV_COUNTED.length) * 100}%` }} />
            </div>
          </div>
          <button type="button" className="nl-x nl-fbtn" aria-label="Close and cancel" onClick={requestClose}><Fa icon={faXmark} /></button>
        </div>
      </header>

      <div className="nl-body">
        {/* Left sidebar */}
        <aside className="nl-side">
          <nav aria-label="Form sections">
            <p className="nl-side-head">Sections</p>
            {sections.map((s) => (
              <button
                key={s.id} type="button" className={`nl-navlink nl-fbtn${current === s.id ? ' is-active' : ''}`}
                aria-current={current === s.id ? 'true' : undefined} onClick={() => goTo(s.id)}
              >
                <span className="nl-nav-ico"><Fa icon={s.icon} /></span>
                <span className="nl-nav-label">{s.label}</span>
                <span className="nl-nav-status">{statusOfSection(s.id)}</span>
              </button>
            ))}
          </nav>
          <div className="nl-tip">
            <div className="nl-tip-head"><Fa icon={faLightbulb} /> What they'll see</div>
            <p>{wide ? 'The preview on the right' : 'The Preview section at the end'} is the exact PDF your customer receives. It updates as you type.</p>
          </div>
        </aside>

        {/* Main form */}
        <main className="nl-main" ref={scrollRef} onScroll={spy}>
          <div className="nl-tabs">
            {sections.map((s) => (
              <button key={s.id} type="button" className={`nl-tab${current === s.id ? ' is-active' : ''}`} onClick={() => goTo(s.id)}>{s.label}</button>
            ))}
          </div>

          <form className="nl-form" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()} onBlur={onBlurCapture}>
            {invoice?.paid && (
              <div className="nl-warn" style={{ marginTop: 0 }}>
                <Fa icon={faTriangleExclamation} />
                <span>Paid {fmtDate(invoice.paid.date)} by {invoice.paid.via}. Changes here do not change the payment.</span>
              </div>
            )}

            {/* 1. Customer & loads */}
            <section id="nl-sec-customer" className="nl-sec">
              <SecHead title="Customer & loads" sub="Who is billed, and for which delivered loads. Ticking a load adds its charges." />
              <div className="nl-card nl-stack-5">
                <div>
                  <label className="nl-lbl" htmlFor="nl-customer">Customer <Req /></label>
                  <Combo
                    id="customer" value={custText} onQuery={setCustText} required searchFromValue={!customerPicked}
                    items={(q) => CUSTOMERS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))}
                    keyOf={(c) => c.name}
                    render={(c, q) => {
                      const n = queue.filter((x) => x.customer === c.name).length;
                      return <><span className="inv-opt-name">{hl(c.name, q)}</span><span className="inv-opt-meta">{n ? `${n} load${n > 1 ? 's' : ''} to bill · ` : ''}{c.terms}</span></>;
                    }}
                    onPick={(c) => pickCustomer(c.name)} between
                    placeholder="Search customers" listLabel="Customers" icon={faMagnifyingGlass}
                    none={(q) => `No customer matches “${q}”. Add it in CRM first.`}
                    invalid={Boolean(errOf('customer'))} describedBy={errOf('customer') ? 'nl-customer-err' : undefined}
                  />
                  {errFor('customer')}
                </div>
                {customerPicked && (
                  <div className="nl-subsec">
                    <p className="nl-subsec-title">Delivered loads to bill</p>
                    {mine.length === 0 && attachedElsewhere.length === 0 ? (
                      <p className="nl-empty" style={{ marginTop: 0 }}>No delivered, uninvoiced loads for {d.customer}. You can still bill custom charges below.</p>
                    ) : (
                      <ul className="inv-loads">
                        {attachedElsewhere.map((id) => (
                          <li key={id}>
                            <label className="inv-load is-on">
                              <input type="checkbox" className="inv-cb" checked onChange={() => dropLoad(id)} />
                              <span className="inv-load-main"><span className="inv-load-id">{id}</span><span className="inv-load-meta">Already on this invoice</span></span>
                            </label>
                          </li>
                        ))}
                        {mine.map((l) => {
                          const on = d.loads.includes(l.id);
                          return (
                            <li key={l.id}>
                              <label className={`inv-load${on ? ' is-on' : ''}`}>
                                <input type="checkbox" className="inv-cb" checked={on} onChange={(e) => toggleLoad(l, e.target.checked)} />
                                <span className="inv-load-main">
                                  <span className="inv-load-id">{l.id}<span className="inv-load-route">{l.route}</span></span>
                                  <span className="inv-load-meta">Delivered {fmtDate(l.delivered, true)}{l.ref ? ` · Ref ${l.ref}` : ''}</span>
                                </span>
                                {l.pod === 'Missing' && <span className="inv-pod"><Fa icon={faTriangleExclamation} />POD missing</span>}
                                <span className="inv-load-amt">{usd(l.amount)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {podMissing && (
                      <div className="nl-warn mt-3">
                        <Fa icon={faTriangleExclamation} />
                        <span>A proof of delivery is missing. Most customers short-pay or reject an invoice without one, so attach it on the load first if you can.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* 2. Bill to */}
            <section id="nl-sec-billto" className="nl-sec">
              <SecHead title="Bill to" sub="The billing address printed on the invoice, and where it's emailed." />
              <div className="nl-card">
                <div className="nl-g sm-6">
                  <div className="sm-span-3">
                    <label className="nl-lbl" htmlFor="nl-bill-name">Bill to <Req /></label>
                    <input {...fieldProps('bill-name')} aria-required="true" className="nl-inp" placeholder="Company name" value={d.billTo.name} onChange={(e) => setBill('name', e.target.value)} />
                    {errFor('bill-name')}
                  </div>
                  <div className="sm-span-3">
                    <label className="nl-lbl" htmlFor="nl-bill-attn">Attention <span className="nl-opt">(optional)</span></label>
                    <input id="nl-bill-attn" className="nl-inp" placeholder="e.g. Accounts Payable" value={d.billTo.attn} onChange={(e) => setBill('attn', e.target.value)} />
                  </div>
                  <div className="sm-span-6">
                    <label className="nl-lbl" htmlFor="nl-bill-street">Street address <Req /></label>
                    <input {...fieldProps('bill-street')} aria-required="true" className="nl-inp" placeholder="Street and number" value={d.billTo.street} onChange={(e) => setBill('street', e.target.value)} />
                    {errFor('bill-street')}
                  </div>
                  <div className="sm-span-6">
                    <div className="nl-csz">
                      <div>
                        <label className="nl-lbl" htmlFor="nl-bill-city">City <Req /></label>
                        <input {...fieldProps('bill-city')} aria-required="true" className="nl-inp" placeholder="City" value={d.billTo.city} onChange={(e) => setBill('city', e.target.value)} />
                      </div>
                      <div>
                        <label className="nl-lbl" htmlFor="nl-bill-state">State <Req /></label>
                        <input {...fieldProps('bill-state')} aria-required="true" maxLength={2} className="nl-inp is-upper" placeholder="CA" value={d.billTo.state}
                          onChange={(e) => setBill('state', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
                      </div>
                      <div>
                        <label className="nl-lbl" htmlFor="nl-bill-zip">ZIP</label>
                        <input id="nl-bill-zip" inputMode="numeric" maxLength={10} className="nl-inp" placeholder="00000" value={d.billTo.zip} onChange={(e) => setBill('zip', e.target.value)} />
                      </div>
                    </div>
                    {errFor('bill-city')}
                    {errFor('bill-state')}
                  </div>
                  <div className="sm-span-3">
                    <label className="nl-lbl" htmlFor="nl-bill-phone">Billing phone <span className="nl-opt">(optional)</span></label>
                    <input id="nl-bill-phone" type="tel" className="nl-inp" placeholder="(555) 000-0000" value={d.billTo.phone} onChange={(e) => setBill('phone', e.target.value)} />
                  </div>
                  <div className="sm-span-3">
                    <label className="nl-lbl" htmlFor="nl-bill-email">Billing email</label>
                    <input {...fieldProps('bill-email')} type="email" className="nl-inp" placeholder="ap@customer.com" value={d.billTo.email} onChange={(e) => setBill('email', e.target.value)} />
                    {errFor('bill-email') ?? <p className="nl-hint">Where the invoice is emailed.</p>}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Invoice details */}
            <section id="nl-sec-details" className="nl-sec">
              <SecHead title="Invoice details" sub="Dates, terms and the customer's own reference numbers. The due date follows the terms." />
              <div className="nl-card">
                <div className="nl-g sm-6">
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-inv-no">Invoice #</label>
                    <div className="nl-rel">
                      <span className="nl-in-ico is-12"><Fa icon={faLock} /></span>
                      <input id="nl-inv-no" className="nl-inp nl-pl-9" value={d.id} readOnly />
                    </div>
                    <p className="nl-hint">Numbered automatically.</p>
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-issued">Invoice date <Req /></label>
                    <input {...fieldProps('issued')} type="date" max="9999-12-31" aria-required="true" className="nl-inp" value={d.issued}
                      onChange={(e) => setD((p) => withTerms(p, p.terms, e.target.value))} />
                    {errFor('issued')}
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-terms">Terms <Req /></label>
                    <div className="nl-rel">
                      <select id="nl-terms" className="nl-inp" value={d.terms} onChange={(e) => setD((p) => withTerms(p, e.target.value))}>
                        {TERMS.map((t) => <option key={t}>{t}</option>)}
                        {!TERMS.includes(d.terms) && <option>{d.terms}</option>}
                      </select>
                      <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                    </div>
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-due">Due date <Req /></label>
                    <input {...fieldProps('due')} type="date" max="9999-12-31" aria-required="true" className="nl-inp" value={d.due}
                      onChange={(e) => setD((p) => ({ ...p, due: e.target.value }))} />
                    {errFor('due') ?? <p className="nl-hint">{followsTerms ? `${d.terms} from the invoice date.` : 'Set by hand.'}</p>}
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-ref">Customer ref / PO <span className="nl-opt">(optional)</span></label>
                    <input id="nl-ref" className="nl-inp" placeholder="So their AP can match it" value={d.ref} onChange={(e) => setD((p) => ({ ...p, ref: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-bol">BOL # <span className="nl-opt">(optional)</span></label>
                    <input id="nl-bol" className="nl-inp" placeholder="e.g. 4410029" value={d.bol} onChange={(e) => setD((p) => ({ ...p, bol: e.target.value }))} />
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Shipment */}
            <section id="nl-sec-shipment" className="nl-sec">
              <SecHead title="Shipment" sub="What moved, as it prints on the invoice. Filled in from the loads you tick." />
              <div className="nl-card">
                <div className="nl-g sm-6">
                  <div className="sm-span-6">
                    <label className="nl-lbl" htmlFor="nl-route">Route</label>
                    <input id="nl-route" className="nl-inp" placeholder="Fresno, CA → Reno, NV" value={d.route} onChange={(e) => setD((p) => ({ ...p, route: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-pickup">Picked up</label>
                    <input id="nl-pickup" type="date" max="9999-12-31" className="nl-inp" value={d.pickup} onChange={(e) => setD((p) => ({ ...p, pickup: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-delivery">Delivered</label>
                    <input id="nl-delivery" type="date" max="9999-12-31" className="nl-inp" value={d.delivery} onChange={(e) => setD((p) => ({ ...p, delivery: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-miles">Miles</label>
                    <input id="nl-miles" inputMode="numeric" className="nl-inp" placeholder="0" value={d.miles} onChange={(e) => setD((p) => ({ ...p, miles: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-equipment">Equipment</label>
                    <input id="nl-equipment" className="nl-inp" placeholder="e.g. Dry van, 53 ft" value={d.equipment} onChange={(e) => setD((p) => ({ ...p, equipment: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-commodity">Commodity</label>
                    <input id="nl-commodity" className="nl-inp" placeholder="e.g. Packaged foods" value={d.commodity} onChange={(e) => setD((p) => ({ ...p, commodity: e.target.value }))} />
                  </div>
                  <div className="sm-span-2">
                    <label className="nl-lbl" htmlFor="nl-weight">Weight</label>
                    <input id="nl-weight" className="nl-inp" placeholder="e.g. 38,000 lb" value={d.weight} onChange={(e) => setD((p) => ({ ...p, weight: e.target.value }))} />
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Charges */}
            <section id="nl-sec-charges" className="nl-sec">
              <SecHead title="Charges" sub="Line haul, fuel surcharge and any accessorials, in USD." />
              <div className="nl-card">
                <div className="nl-charges-top">
                  <div>
                    <p id="nl-lines-label" className="nl-charges-title">Charges <Req /></p>
                    <p className="nl-toggle-sub">Amount = quantity × rate. A negative rate is a discount.</p>
                  </div>
                  <button id="nl-btn-add-line" type="button" className="nl-btn-line nl-fbtn" onClick={() => addLine({ kind: '', description: '', qty: '1', rate: '' })}>
                    <Fa icon={faPlus} />Add charge
                  </button>
                </div>
                {d.lines.length > 0 && (
                  <div className="inv-line-grid inv-line-head" aria-hidden="true">
                    <span className="inv-line-kind">Type</span><span className="inv-line-desc">Description</span><span className="inv-line-qty is-num">Qty</span>
                    <span className="inv-line-rate is-num">Rate</span><span className="inv-line-amt is-num">Amount</span><span className="inv-line-x" />
                  </div>
                )}
                <ul className="nl-charge-list" aria-labelledby="nl-lines-label">
                  {d.lines.map((l, i) => (
                    <li key={i}>
                      <div className="inv-line-grid">
                        <div className="nl-rel inv-line-kind">
                          <select {...fieldProps(`line-${i}-kind`)} aria-label="Charge type" className="nl-inp" value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value })}>
                            <option value="">Type…</option>
                            {CHARGE_TYPES.map((t) => <option key={t}>{t}</option>)}
                            {l.kind && !CHARGE_TYPES.includes(l.kind) && <option>{l.kind}</option>}
                          </select>
                          <span className="nl-chev"><Fa icon={faChevronDown} /></span>
                        </div>
                        <input id={`nl-line-${i}-desc`} aria-label="Description" className="nl-inp inv-line-desc" placeholder="Printed on the invoice" value={l.description}
                          onChange={(e) => setLine(i, { description: e.target.value })} />
                        <input {...fieldProps(`line-${i}-qty`)} aria-label="Quantity" inputMode="decimal" className="nl-inp is-num inv-line-qty" value={l.qty}
                          onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                        <div className="nl-rel inv-line-rate">
                          <span className="nl-pre">$</span>
                          <input {...fieldProps(`line-${i}-rate`)} aria-label="Rate" inputMode="decimal" className="nl-inp nl-pl-7 is-num" placeholder="0.00" value={l.rate}
                            onChange={(e) => setLine(i, { rate: e.target.value.replace(/[^\d.-]/g, '') })} />
                        </div>
                        <span className="inv-line-amt">{usd(lineAmount(l))}</span>
                        <button type="button" className="nl-icon-btn nl-fbtn inv-line-x" aria-label={`Remove ${l.kind || 'charge'}`} onClick={() => removeLine(i)}><Fa icon={faXmark} /></button>
                      </div>
                      {errFor(`line-${i}-kind`)}
                      {errFor(`line-${i}-qty`)}
                      {errFor(`line-${i}-rate`)}
                    </li>
                  ))}
                </ul>
                {d.lines.length === 0 && (
                  <p className="nl-empty">No charges yet. Tick a delivered load above, or use <span>Add charge</span>.</p>
                )}
                {errFor('btn-add-line')}
                <div className="inv-quick">
                  <span>Quick add</span>
                  {QUICK().map((q) => (
                    <button key={q.label} type="button" className="inv-chipbtn nl-fbtn" onClick={() => addLine({ ...q.line })}><Fa icon={faPlus} />{q.label}</button>
                  ))}
                </div>
                <div className="inv-total"><span>Total due</span><output aria-live="polite">{usd(total)}</output></div>
              </div>
            </section>

            {/* 6. Notes */}
            <section id="nl-sec-notes" className={`nl-sec${lastSection === 'notes' ? ' is-last' : ''}`}>
              <SecHead title="Notes" sub="A note printed on the invoice, and one for your team only." />
              <div className="nl-card nl-stack-5">
                <div>
                  <label className="nl-lbl" htmlFor="nl-memo">Note on the invoice <span className="nl-opt">(optional)</span></label>
                  <textarea id="nl-memo" rows={3} className="nl-inp" placeholder="e.g. Detention per signed in/out times on the BOL." value={d.memo}
                    onChange={(e) => setD((p) => ({ ...p, memo: e.target.value }))} />
                  <p className="nl-hint">Printed above the payment instructions.</p>
                </div>
                <div>
                  <label className="nl-lbl" htmlFor="nl-internal">Internal note <span className="nl-opt">(optional)</span></label>
                  <textarea id="nl-internal" rows={3} className="nl-inp" value={d.internal} onChange={(e) => setD((p) => ({ ...p, internal: e.target.value }))} />
                  <p className="nl-hint">Only your team sees this. It is not on the invoice.</p>
                </div>
                {d.history.length > 0 && (
                  <div className="nl-subsec">
                    <p className="nl-subsec-title">History</p>
                    <ul className="inv-history">
                      {d.history.map((h, i) => <li key={i}><b>{fmtDate(h.date, true)}</b>{h.text}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* 7. Preview, on narrower screens */}
            {!wide && (
              <section id="nl-sec-preview" className="nl-sec is-last">
                <SecHead title="Preview" sub="Exactly what the customer receives." right={pdfButtons} />
                {facts}
                <div className="inv-pre-paper"><PdfPages doc={doc} /></div>
              </section>
            )}
          </form>
        </main>

        {/* Right: the invoice itself */}
        {wide && (
          <aside className="inv-pre" aria-labelledby="inv-pre-title">
            <div className="inv-pre-head">
              <div>
                <h3 id="inv-pre-title">Invoice preview</h3>
                <p>Exactly what {d.customer || 'your customer'} receives</p>
              </div>
              {pdfButtons}
            </div>
            {facts}
            <div className="inv-pre-paper"><PdfPages doc={doc} /></div>
          </aside>
        )}
      </div>

      {/* Footer */}
      <footer className="nl-foot">
        <div className="nl-foot-row">
          <div className="nl-foot-left">
            <p role="status" aria-live="polite" className="nl-status">{statusLine}</p>
            <span className="nl-keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> {issuedAlready ? 'save' : 'create'} <span className="nl-bar">|</span> <kbd>Esc</kbd> cancel</span>
          </div>
          <div className="nl-foot-btns">
            {!isNew && <button type="button" className="nl-btn-danger-line nl-fbtn" onClick={() => setConfirm('delete')}>Delete</button>}
            <button id="nl-btn-cancel" type="button" className="nl-btn-ghost nl-fbtn" onClick={requestClose}>Cancel</button>
            {!issuedAlready && <button type="button" className="nl-btn-white nl-fbtn" onClick={saveDraft}>Save draft</button>}
            <button type="button" className="nl-btn-white nl-fbtn" onClick={() => create(true)}>{issuedAlready ? 'Save & email' : 'Create & email'}</button>
            <button type="button" className="nl-btn-main nl-fbtn" onClick={() => create(false)}>
              <span>{issuedAlready ? 'Save changes' : 'Create invoice'}</span><Fa icon={faArrowRight} />
            </button>
          </div>
        </div>
      </footer>

      {confirm && (
        <NlConfirm
          danger={confirm === 'delete'}
          title={confirm === 'delete' ? `Delete invoice ${d.id}?` : 'Discard unsaved changes?'}
          body={confirm === 'delete'
            ? `It's removed for good${d.loads.length ? ` and ${d.loads.join(', ')} go${d.loads.length === 1 ? 'es' : ''} back to Uninvoiced` : ''}. It also leaves any batch it was in.`
            : isNew ? 'You’ve started filling in this invoice. If you cancel now, what you’ve entered won’t be saved.' : `The changes you’ve made to ${d.id} won’t be saved.`}
          confirmLabel={confirm === 'delete' ? 'Delete invoice' : 'Discard'}
          onConfirm={confirm === 'delete' ? remove : closeNow}
          onCancel={keepEditing}
        />
      )}

      {/* Outside the popup's styles: the email form keeps the app's own look. */}
      {emailing && createPortal(<EmailInvoiceDialog invoice={emailing} onClose={() => { setEmailing(null); closeNow(); }} />, document.body)}
    </dialog>
  );
}

// Email an invoice: the message is filled in and the PDF downloaded to attach.
// There is no mail server yet, so Send opens the person's email app.
export function EmailInvoiceDialog({ invoice, onClose }: { invoice: InvoiceRecord; onClose: () => void }) {
  const { saveInvoice } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const tpl = invoiceEmail(invoice);
  const [to, setTo] = useState(invoice.billTo.email);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [attach, setAttach] = useState(true);
  const [tried, setTried] = useState(false);
  const toError = !isEmail(to) ? 'Enter the customer’s billing email' : '';
  const ccError = cc.trim() && !cc.split(',').every((x) => isEmail(x)) ? 'Separate addresses with commas' : '';

  const send = () => {
    setTried(true);
    // A draft is not an invoice yet: it has to be created (and checked) first.
    if (toError || ccError || invoice.draft) return;
    if (attach) downloadPdf(invoiceDoc(invoice), invoiceFileName(invoice));
    launch(mailtoHref(to, subject, body, cc));
    saveInvoice({
      ...invoice,
      draft: false,
      sentOn: TODAY,
      sentTo: to.trim(),
      history: [...invoice.history, { date: TODAY, text: `Emailed to ${to.trim()}${cc.trim() ? ` (cc ${cc.trim()})` : ''}` }],
    });
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-medium" aria-label={`Email ${invoice.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>Email {invoice.id}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{invoice.customer} · {usd(invoiceTotal(invoice))} due {fmtDate(invoice.due)}</p>
          </div>
          <div className="ui-form-grid">
            <Field label="To" required wide error={tried && toError}>
              <input className="ui-input" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Cc" wide error={tried && ccError}>
              <input className="ui-input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, comma-separated" />
            </Field>
            <Field label="Subject" wide>
              <input className="ui-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Message" wide>
              <textarea className="ui-input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Download <strong>{invoiceFileName(invoice)}</strong> to attach
            <button type="button" className="ui-link" style={{ marginLeft: 8 }} onClick={() => openPdf(invoiceDoc(invoice))}>Preview ↗</button>
          </label>
          {invoice.draft && <div className="ui-errors">{invoice.id} is still a draft. Open it with Edit invoice and choose Create invoice (which checks it), then email it.</div>}
          <div className="ui-note">RunTruck does not send email itself yet: Send opens your email app with this message filled in and downloads the PDF for you to attach. The invoice is marked as sent.</div>
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn ui-btn-primary" onClick={send} disabled={invoice.draft}>Send</button>
        </footer>
      </div>
    </dialog>
  );
}

// Record a payment against an invoice.
export function PaymentDialog({ invoice, onClose }: { invoice: InvoiceRecord; onClose: () => void }) {
  const { saveInvoice } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [date, setDate] = useState(TODAY);
  const [via, setVia] = useState(PAY_METHODS[0]);
  const [reference, setReference] = useState('');
  const save = () => {
    if (!date) return;
    saveInvoice({
      ...invoice,
      paid: { date, via, reference: reference.trim() },
      history: [...invoice.history, { date, text: `Payment received · ${via}${reference.trim() ? ` · ${reference.trim()}` : ''}` }],
    });
    closeNow();
  };
  return (
    <dialog ref={ref} className="ui-dialog is-confirm" aria-label={`Record payment for ${invoice.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <h2 className="ui-h2" style={{ margin: 0 }}>Record payment</h2>
          <p className="ui-p" style={{ marginTop: 0 }}>{invoice.id} · {invoice.customer} · {usd(invoiceTotal(invoice))}</p>
          <div className="ui-form-grid">
            <Field label="Paid on" required>
              <input className="ui-input" type="date" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Method" required>
              <select className="ui-input" value={via} onChange={(e) => setVia(e.target.value)}>
                {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference" wide>
              <input className="ui-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, ACH trace or advance #" />
            </Field>
          </div>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>Mark paid</button>
        </footer>
      </div>
    </dialog>
  );
}

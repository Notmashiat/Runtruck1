import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import {
  faArrowRight, faCheck, faChevronDown, faCircleCheck, faCircleExclamation, faExclamation, faXmark, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { faCircle, faLightbulb } from '@fortawesome/free-regular-svg-icons';
import type { FormValues } from '../data/fleet';
import { Fa } from './Fa';
import { NlConfirm, Req, SecHead } from './nlParts';
import { text, validate, visibleFields, type FieldSpec, type RecordDialogProps } from './RecordDialog';

// A record form in the Add fleet unit design (release 1.36): a header with an
// icon, what the form is for and a progress bar; every section on one
// scrolling page with a section menu on the left (each section's status);
// a summary with the required details on the right; a footer with what is
// left to fill in. It takes the same sections as RecordDialog, so customers,
// facilities and unit documents use it with their own fields.

export interface NlRecordDialogProps extends RecordDialogProps {
  icon: IconDefinition;
  description: string;
  // The summary panel's content for the form as it is now.
  summary?: (v: FormValues) => ReactNode;
  tip?: { title: string; text: string };
}

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const later = (fn: () => void) => window.setTimeout(fn, 0);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function NlRecordDialog(p: NlRecordDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [v, setV] = useState<FormValues>(p.initial);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState<null | 'discard' | 'delete'>(null);
  const [current, setCurrent] = useState(slug(p.sections[0].title));

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const errors = validate(p.sections, v);
  const dirty = Boolean(p.extraDirty) || JSON.stringify(v) !== JSON.stringify(p.initial);
  const shown = (key: string) => Boolean(errors[key]) && (submitted || touched.has(key));
  const set = (key: string, value: string | string[]) =>
    setV((prev) => {
      const next = { ...prev, [key]: value };
      return p.adjust ? p.adjust(prev, next, key) : next;
    });
  const touch = (...keys: string[]) => setTouched((t) => {
    const n = new Set(t);
    keys.forEach((k) => n.add(k));
    return n;
  });
  const onBlurCapture = (e: FocusEvent<HTMLFormElement>) => {
    const id = (e.target as HTMLElement).id;
    if (id.startsWith('nlr-')) touch(id.slice(4));
  };

  // — sections and their state —
  const sec = p.sections.map((s) => {
    const applies = !s.when || s.when(v);
    const fields = applies ? visibleFields(s, v) : [];
    const required = fields.filter((f) => f.required);
    const missing = fields.filter((f) => errors[f.key]);
    return { s, id: slug(s.title), applies, fields, required, missing, err: missing.some((f) => shown(f.key)) };
  });
  const counted = sec.filter((x) => x.applies && x.required.length > 0);
  const secDone = counted.filter((x) => x.missing.length === 0).length;
  const remaining = sec.reduce((n, x) => n + x.missing.length, 0);

  const statusOf = (x: (typeof sec)[number]): ReactNode => {
    if (!x.applies) return <span className="nl-st-opt">N/A</span>;
    if (x.missing.length === 0) {
      return x.required.length || x.fields.some((f) => text(v, f.key)) ? <span className="nl-st-done"><Fa icon={faCheck} /><span className="nl-sr">complete</span></span> : <span className="nl-st-opt">Optional</span>;
    }
    if (x.err) return <span className="nl-st-err"><Fa icon={faExclamation} />{x.missing.length}</span>;
    const total = Math.max(x.required.length, x.missing.length);
    return <span className="nl-st-count">{total - x.missing.length}/{total}</span>;
  };

  // — navigation —
  const goTo = (id: string) => {
    const el = document.getElementById(`nlr-sec-${id}`);
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const spy = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    let now = sec[0].id;
    for (const x of sec) {
      const el = document.getElementById(`nlr-sec-${x.id}`);
      if (el && el.offsetTop - sc.scrollTop <= 140) now = x.id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) now = sec[sec.length - 1].id;
    setCurrent(now);
  };
  const focusField = (key: string) => later(() => {
    const el = document.getElementById(`nlr-${key}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  // — closing, saving —
  const closeNow = () => {
    ref.current?.close();
    p.onClose();
  };
  const requestClose = () => {
    if (dirty) setConfirm('discard');
    else closeNow();
  };
  const save = () => {
    const firstBad = sec.flatMap((x) => x.missing)[0];
    if (firstBad) {
      setSubmitted(true);
      focusField(firstBad.key);
      return;
    }
    p.onSave(v);
    closeNow();
  };

  // — one field —
  const field = (f: FieldSpec) => {
    const id = `nlr-${f.key}`;
    const err = shown(f.key) ? errors[f.key] : '';
    const wide = f.wide || f.type === 'textarea' || f.type === 'checks';
    const label = (
      <>
        {f.label} {f.required ? <Req /> : <span className="nl-opt">(optional)</span>}
      </>
    );
    const foot = err
      ? <p id={`${id}-err`} className="nl-err"><Fa icon={faCircleExclamation} /><span>{err === 'Required' ? `Enter the ${f.label.toLowerCase()}.` : err}</span></p>
      : f.help ? <p className="nl-hint">{f.help}</p> : null;
    const aria = { 'aria-invalid': (err ? 'true' : 'false') as 'true' | 'false', 'aria-describedby': err ? `${id}-err` : undefined, 'aria-required': f.required || undefined };
    const value = text(v, f.key);

    if (f.type === 'checks') {
      const chosen = Array.isArray(v[f.key]) ? (v[f.key] as string[]) : [];
      return (
        <div key={f.key} className="nlr-wide" role="group" aria-labelledby={`${id}-label`}>
          <span id={`${id}-label`} className="nl-lbl">{label}</span>
          <div className="nlr-checks">
            {(f.options ?? []).map((o) => (
              <label key={o} className="nlr-check">
                <input type="checkbox" checked={chosen.includes(o)} onChange={(e) => set(f.key, e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          {foot}
        </div>
      );
    }
    let control: ReactNode;
    if (f.type === 'select') {
      control = (
        <div className="nl-rel">
          <select id={id} className="nl-inp" value={value} {...aria} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{f.required ? 'Select…' : 'None'}</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            {value && !(f.options ?? []).includes(value) && <option value={value}>{value}</option>}
          </select>
          <span className="nl-chev"><Fa icon={faChevronDown} /></span>
        </div>
      );
    } else if (f.type === 'textarea') {
      control = <textarea id={id} rows={3} className="nl-inp" value={value} placeholder={f.placeholder} {...aria} onChange={(e) => set(f.key, e.target.value)} />;
    } else {
      control = (
        <input
          id={id} className={`nl-inp${f.upper ? ' is-upper' : ''}`} type={f.type ?? 'text'} max={f.type === 'date' ? '9999-12-31' : undefined}
          value={value} placeholder={f.placeholder} maxLength={f.maxLength} {...aria}
          autoComplete={f.type === 'password' ? 'new-password' : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined}
          onChange={(e) => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
        />
      );
    }
    return (
      <div key={f.key} className={wide ? 'nlr-wide' : undefined}>
        <label className="nl-lbl" htmlFor={id}>{label}</label>
        {control}
        {foot}
      </div>
    );
  };

  const statusLine = remaining === 0
    ? <><Fa icon={faCircleCheck} className="is-ok" /><span className="is-ok-text">{p.isNew ? 'Ready to add' : 'Ready to save'}</span></>
    : submitted
      ? <><Fa icon={faCircleExclamation} className="is-bad" /><span className="is-bad-text">Fix {remaining} field{remaining > 1 ? 's' : ''} to {p.isNew ? 'add' : 'save'} this {p.noun}</span></>
      : <><span className="nl-req">*</span><span className="is-left">{remaining} required field{remaining > 1 ? 's' : ''} left</span></>;

  return (
    <dialog
      ref={ref}
      className="nl"
      aria-labelledby="nlr-title"
      aria-describedby="nlr-desc"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (confirm) setConfirm(null);
        else requestClose();
      }}
      onClose={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirm) { e.preventDefault(); save(); }
      }}
    >
      <header className="nl-head">
        <div className="nl-head-left">
          <div className="nl-head-ico"><Fa icon={p.icon} /></div>
          <div>
            <h1 id="nlr-title" ref={titleRef} tabIndex={-1} className="nl-title">{p.heading}</h1>
            <p id="nlr-desc" className="nl-desc">{p.description} <span className="nl-req">*</span> Required.</p>
          </div>
        </div>
        <div className="nl-head-right">
          {counted.length > 0 && (
            <div className="nl-progress">
              <div className="nl-progress-row"><span>Progress</span><span>{secDone} of {counted.length} sections</span></div>
              <div className="nl-progress-track" role="progressbar" aria-label="Sections completed" aria-valuemin={0} aria-valuemax={counted.length} aria-valuenow={secDone}>
                <div className="nl-progress-bar" style={{ width: `${(secDone / counted.length) * 100}%` }} />
              </div>
            </div>
          )}
          <button type="button" className="nl-x nl-fbtn" aria-label="Close and cancel" onClick={requestClose}><Fa icon={faXmark} /></button>
        </div>
      </header>

      <div className="nl-body">
        <aside className="nl-side">
          <nav aria-label="Form sections">
            <p className="nl-side-head">Sections</p>
            {sec.map((x) => (
              <button
                key={x.id} type="button" className={`nl-navlink nl-fbtn${current === x.id ? ' is-active' : ''}`}
                aria-current={current === x.id ? 'true' : undefined} onClick={() => goTo(x.id)}
              >
                <span className="nl-nav-ico">{x.s.icon ? <Fa icon={x.s.icon} /> : <Fa icon={faCircle} />}</span>
                <span className="nl-nav-label">{x.s.title}</span>
                <span className="nl-nav-status">{statusOf(x)}</span>
              </button>
            ))}
          </nav>
          {p.tip && (
            <div className="nl-tip">
              <div className="nl-tip-head"><Fa icon={faLightbulb} /> {p.tip.title}</div>
              <p>{p.tip.text}</p>
            </div>
          )}
        </aside>

        <main className="nl-main" ref={scrollRef} onScroll={spy}>
          <div className="nl-tabs">
            {sec.map((x) => (
              <button key={x.id} type="button" className={`nl-tab${current === x.id ? ' is-active' : ''}`} onClick={() => goTo(x.id)}>{x.s.title}</button>
            ))}
          </div>
          <form className="nl-form" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()} onBlur={onBlurCapture}>
            {p.archived && (
              <div className="nl-warn" style={{ marginTop: 0 }}>
                <Fa icon={faCircleExclamation} />
                <span>This {p.noun} is archived: hidden from lists and pickers but kept on file. Restore it to use it again.</span>
              </div>
            )}
            {p.banner}
            {sec.map((x, i) => {
              const extra = p.extras?.[x.s.title];
              return (
                <section key={x.id} id={`nlr-sec-${x.id}`} className={`nl-sec${i === sec.length - 1 ? ' is-last' : ''}`}>
                  <SecHead title={x.s.title} sub={x.s.help} />
                  {x.applies ? (
                    <div className="nl-card nl-stack-5">
                      {x.fields.length > 0 && <div className="nl-g sm-2">{x.fields.map(field)}</div>}
                      {typeof extra === 'function' ? extra(v) : extra}
                    </div>
                  ) : (
                    <p className="nl-empty" style={{ marginTop: 0 }}>{x.s.naText ?? 'Nothing to fill in here.'}</p>
                  )}
                </section>
              );
            })}
          </form>
        </main>

        <aside className="nl-sum" aria-labelledby="nlr-h-summary">
          <h3 id="nlr-h-summary">{p.noun[0].toUpperCase() + p.noun.slice(1)} summary</h3>
          {p.summary && <dl className="nlr-summary">{p.summary(v)}</dl>}
          {counted.length > 0 && (
            <div className="nl-check">
              <div className="nl-check-top"><h3>Required details</h3><span>{secDone} of {counted.length}</span></div>
              <ul className="nl-checklist">
                {counted.map((x) => (x.missing.length === 0 ? (
                  <li key={x.id} className="nl-check-done"><Fa icon={faCircleCheck} /><span>{x.s.title}</span><span className="nl-sr">(complete)</span></li>
                ) : (
                  <li key={x.id}>
                    <button type="button" className="nl-check-todo nl-fbtn" onClick={() => { touch(...x.missing.map((f) => f.key)); focusField(x.missing[0].key); }}>
                      <Fa icon={faCircle} className={`nl-c-ico${x.err ? ' is-red' : ''}`} />
                      <span className="nl-c-label">{x.s.title}</span>
                      <span className="nl-sr">(missing — go to field)</span>
                      <Fa icon={faArrowRight} className="nl-c-arrow" />
                    </button>
                  </li>
                )))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="nl-foot">
        <div className="nl-foot-row">
          <div className="nl-foot-left">
            <p role="status" aria-live="polite" className="nl-status">{statusLine}</p>
            <span className="nl-keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> save <span className="nl-bar">|</span> <kbd>Esc</kbd> cancel</span>
          </div>
          <div className="nl-foot-btns">
            {!p.isNew && p.onDelete && <button type="button" className="nl-btn-danger-line nl-fbtn" onClick={() => setConfirm('delete')}>Delete</button>}
            {!p.isNew && p.onArchive && (
              <button type="button" className="nl-btn-white nl-fbtn" onClick={() => { p.onArchive?.(!p.archived); closeNow(); }}>{p.archived ? 'Restore' : 'Archive'}</button>
            )}
            {p.footerExtra}
            <button type="button" className="nl-btn-ghost nl-fbtn" onClick={requestClose}>Cancel</button>
            <button type="button" className="nl-btn-main nl-fbtn" onClick={save}><span>{p.saveLabel}</span><Fa icon={faArrowRight} /></button>
          </div>
        </div>
      </footer>

      {confirm && (
        <NlConfirm
          danger={confirm === 'delete'}
          title={confirm === 'delete' ? `Delete ${p.recordLabel}?` : 'Discard unsaved changes?'}
          body={confirm === 'delete' ? p.deleteNote : p.isNew ? `You’ve started filling in this ${p.noun}. If you cancel now, what you’ve entered won’t be saved.` : `The changes you’ve made to ${p.recordLabel} won’t be saved.`}
          confirmLabel={confirm === 'delete' ? `Delete ${p.noun}` : 'Discard'}
          onConfirm={() => { if (confirm === 'delete') p.onDelete?.(); closeNow(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </dialog>
  );
}

// A row of the summary panel: a label over its value, or "Not set".
export function SumRow({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <div className="nlr-sum-row">
      <dt>{label}</dt>
      <dd>{value ? <>{value}{sub && <span className="nl-sum-sub">{sub}</span>}</> : <span className="is-unset">Not set</span>}</dd>
    </div>
  );
}

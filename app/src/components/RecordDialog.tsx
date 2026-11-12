import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { FormValues } from '../data/fleet';

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'url' | 'select' | 'textarea' | 'tel' | 'email' | 'checks' | 'password';

export interface FieldSpec {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: string[];
  wide?: boolean;
  placeholder?: string;
  maxLength?: number;
  upper?: boolean;
  help?: string;
  // Hidden fields are neither shown nor checked.
  show?: (v: FormValues) => boolean;
  // Extra rule: return a message when the value is not acceptable.
  check?: (value: string, v: FormValues) => string | null;
}

export interface SectionSpec {
  title: string;
  help: string;
  fields: FieldSpec[];
  // A section that does not apply (e.g. reefer unit on a dry van) shows N/A.
  when?: (v: FormValues) => boolean;
  naText?: string;
  // Its icon in the section menu of the New Load-style popups (NlRecordDialog).
  icon?: IconDefinition;
}

export interface RecordDialogProps {
  heading: string;
  saveLabel: string;
  sections: SectionSpec[];
  initial: FormValues;
  isNew: boolean;
  archived?: boolean;
  recordLabel: string;
  noun: string;
  deleteNote: string;
  // Shown under every section's title (e.g. the record's ID).
  banner?: ReactNode;
  // More buttons in the footer, after Cancel (e.g. Move to inactive).
  footerExtra?: ReactNode;
  // Extra content under a section's fields, by section title (e.g. attachments);
  // a function gets the form as it is now.
  extras?: Record<string, ReactNode | ((v: FormValues) => ReactNode)>;
  // Something outside the fields was changed (documents attached, items added):
  // closing then asks before discarding, as it does for the fields.
  extraDirty?: boolean;
  // Follow-on changes when a field changes (e.g. a preset filling a checklist).
  adjust?: (prev: FormValues, next: FormValues, key: string) => FormValues;
  onSave: (v: FormValues) => void;
  onArchive?: (archived: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const text = (v: FormValues, k: string) => {
  const x = v[k];
  return typeof x === 'string' ? x : '';
};

export function visibleFields(s: SectionSpec, v: FormValues) {
  if (s.when && !s.when(v)) return [];
  return s.fields.filter((f) => !f.show || f.show(v));
}

// Field key → problem, for every visible field.
export function validate(sections: SectionSpec[], v: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const s of sections) {
    for (const f of visibleFields(s, v)) {
      const raw = v[f.key];
      const value = Array.isArray(raw) ? raw.join(',') : (raw ?? '').trim();
      if (f.required && !value) errors[f.key] = 'Required';
      else if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[f.key] = 'Enter a valid email';
      else if (value && f.type === 'url' && !/^https?:\/\/\S+\.\S+$/.test(value)) errors[f.key] = 'Enter a full link, starting with https://';
      else if (value && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[f.key] = 'Enter a date with a four-digit year';
      else if (value && f.check) {
        const msg = f.check(value, v);
        if (msg) errors[f.key] = msg;
      }
    }
  }
  return errors;
}

// A form popup for a fleet record (driver, truck, trailer): the same shell as
// New Load — a section menu on the left, required fields checked on save with
// counts in the menu — plus Archive / Restore and Delete when editing.
export function RecordDialog(p: RecordDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const [v, setV] = useState<FormValues>(p.initial);
  const [section, setSection] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const errors = validate(p.sections, v);
  const dirty = Boolean(p.extraDirty) || JSON.stringify(v) !== JSON.stringify(p.initial);
  const set = (key: string, value: string | string[]) =>
    setV((prev) => {
      const next = { ...prev, [key]: value };
      return p.adjust ? p.adjust(prev, next, key) : next;
    });
  const sectionErrors = (i: number) => visibleFields(p.sections[i], v).filter((f) => errors[f.key]).length;

  const go = (i: number) => {
    setSection(i);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // Close and tell the page right away rather than waiting for the dialog's
  // close event (browsers deliver it later, and not at all in hidden tabs).
  const closeNow = () => {
    ref.current?.close();
    p.onClose();
  };
  const requestClose = () => {
    const message = p.isNew ? `Discard this new ${p.noun}? What you entered will be lost.` : `Discard your changes to ${p.recordLabel}?`;
    if (!dirty || window.confirm(message)) closeNow();
  };

  const save = () => {
    const firstBad = p.sections.findIndex((_, i) => sectionErrors(i) > 0);
    if (firstBad >= 0) {
      setShowErrors(true);
      go(firstBad);
      return;
    }
    p.onSave(v);
    closeNow();
  };

  const field = (f: FieldSpec) => {
    const err = showErrors ? errors[f.key] : undefined;
    const cls = `ui-field${f.wide || f.type === 'textarea' || f.type === 'checks' ? ' is-wide' : ''}${err ? ' is-invalid' : ''}`;
    const head = (
      <span className="ui-field-label">
        {f.label}
        {f.required && <span className="ui-req"> *</span>}
      </span>
    );
    const foot = (
      <>
        {f.help && !err && <span className="ui-field-help">{f.help}</span>}
        {err && <span className="ui-field-error">{err}</span>}
      </>
    );

    if (f.type === 'checks') {
      const chosen = Array.isArray(v[f.key]) ? (v[f.key] as string[]) : [];
      return (
        <div key={f.key} className={cls} role="group" aria-label={f.label}>
          {head}
          <div className="ui-checks">
            {(f.options ?? []).map((o) => (
              <label key={o} className="ui-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(o)}
                  onChange={(e) => set(f.key, e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))}
                />
                {o}
              </label>
            ))}
          </div>
          {foot}
        </div>
      );
    }

    let control: ReactNode;
    const value = text(v, f.key);
    if (f.type === 'select') {
      control = (
        <select className="ui-input" value={value} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">{f.required ? 'Select…' : 'None'}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          {value && !(f.options ?? []).includes(value) && <option value={value}>{value}</option>}
        </select>
      );
    } else if (f.type === 'textarea') {
      control = <textarea className="ui-input" value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    } else {
      control = (
        <input
          className="ui-input"
          type={f.type ?? 'text'}
          // A date box otherwise accepts five- and six-digit years.
          max={f.type === 'date' ? '9999-12-31' : undefined}
          value={value}
          placeholder={f.placeholder}
          maxLength={f.maxLength}
          autoComplete={f.type === 'password' ? 'new-password' : undefined}
          inputMode={f.type === 'number' ? 'decimal' : undefined}
          onChange={(e) => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
        />
      );
    }
    return (
      <label key={f.key} className={cls}>
        {head}
        {control}
        {foot}
      </label>
    );
  };

  const current = p.sections[section];
  const applies = !current.when || current.when(v);

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-large"
      aria-label={p.heading}
      onClose={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        requestClose();
      }}
    >
      <aside className="ui-dialog-nav">
        <div className="ui-dialog-title">{p.heading}</div>
        {p.sections.map((s, i) => {
          const n = showErrors ? sectionErrors(i) : 0;
          const na = s.when && !s.when(v);
          return (
            <button key={s.title} type="button" className={`ui-dialog-nav-item${section === i ? ' is-active' : ''}`} onClick={() => go(i)}>
              <span>{s.title}</span>
              {n > 0 && <span className="ui-badge" aria-label={`${n} to fix`}>{n}</span>}
              {n === 0 && na && <span className="ui-nav-note">N/A</span>}
            </button>
          );
        })}
      </aside>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body" ref={bodyRef}>
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>{current.title}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{current.help}</p>
          </div>
          {p.banner}
          {p.archived && (
            <div className="ui-note">This {p.noun} is archived: hidden from lists and pickers but kept on file. Restore it to use it again.</div>
          )}
          {applies ? (
            <>
              <div className="ui-form-grid">{visibleFields(current, v).map(field)}</div>
              {(() => {
                const extra = p.extras?.[current.title];
                return typeof extra === 'function' ? extra(v) : extra;
              })()}
            </>
          ) : (
            <div className="ui-note">{current.naText ?? 'Nothing to fill in here.'}</div>
          )}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          {p.footerExtra}
          {!p.isNew && p.onArchive && (
            <button
              type="button"
              className="ui-btn"
              onClick={() => {
                p.onArchive?.(!p.archived);
                closeNow();
              }}
            >
              {p.archived ? 'Restore' : 'Archive'}
            </button>
          )}
          {!p.isNew && p.onDelete && (
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          {section > 0 && <button type="button" className="ui-btn" onClick={() => go(section - 1)}>Back</button>}
          {section < p.sections.length - 1 && <button type="button" className="ui-btn" onClick={() => go(section + 1)}>Next</button>}
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>{p.saveLabel}</button>
        </footer>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${p.recordLabel}?`}
          body={p.deleteNote}
          confirmLabel={`Yes, delete ${p.noun}`}
          onConfirm={() => {
            setConfirmDelete(false);
            p.onDelete?.();
            closeNow();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </dialog>
  );
}

// "Are you sure?" on top of another dialog. Cancel is focused first, so Enter
// never confirms by accident; its close/cancel events stop here so they do not
// also close the dialog underneath.
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-confirm"
      role="alertdialog"
      aria-label={title}
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <h2 className="ui-h2" style={{ margin: 0 }}>{title}</h2>
          <p className="ui-p" style={{ marginTop: 0 }}>{body}</p>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={() => { ref.current?.close(); onClose(); }} autoFocus>Cancel</button>
          <button type="button" className="ui-btn ui-btn-danger-solid" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </dialog>
  );
}

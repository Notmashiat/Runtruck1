import { useEffect, useRef, type ReactNode } from 'react';
import type { Load } from '../data/mock';

// Pieces shared by the New Load popup's two layouts.

export interface FieldProps {
  label: string;
  required?: boolean;
  invalid?: boolean;
  wide?: boolean;
  group?: boolean;
  children: ReactNode;
}

// A labelled form control. `group` renders a <div> for controls that are not a
// single input (segmented choices), so the label does not swallow their clicks.
export function Field({ label, required, invalid, wide, group, children }: FieldProps) {
  const cls = `ui-field${wide ? ' is-wide' : ''}${invalid ? ' is-invalid' : ''}`;
  const head = (
    <span className="ui-field-label">
      {label}
      {required && <span className="ui-req"> *</span>}
    </span>
  );
  const error = invalid && <span className="ui-field-error">Required</span>;
  return group ? (
    <div className={cls} role="group" aria-label={label}>{head}{children}{error}</div>
  ) : (
    <label className={cls}>{head}{children}{error}</label>
  );
}

export function Choice<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ui-filter" style={{ alignSelf: 'flex-start' }}>
      {options.map((o) => (
        <button key={o} type="button" className={`ui-filter-opt${value === o ? ' is-active' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// "Are you sure?" for Delete load: its own small modal on top of the form.
// Cancel is focused first, so Enter never deletes by accident.
export function ConfirmDelete({ load, onConfirm, onClose }: { load: Load; onConfirm: () => void; onClose: () => void }) {
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
      aria-label={`Delete load ${load.id}?`}
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <h2 className="ui-h2" style={{ margin: 0 }}>Delete load {load.id}?</h2>
          <p className="ui-p" style={{ marginTop: 0 }}>
            {load.customer} · {load.route}. The load is removed from the board, its load page and the planner.
            This can’t be undone.
          </p>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={() => { ref.current?.close(); onClose(); }} autoFocus>Cancel</button>
          <button type="button" className="ui-btn ui-btn-danger-solid" onClick={onConfirm}>Yes, delete load</button>
        </footer>
      </div>
    </dialog>
  );
}

export function Head({ title, help }: { title: string; help: string }) {
  return (
    <div>
      <h2 className="ui-h2" style={{ margin: 0 }}>{title}</h2>
      <p className="ui-p" style={{ marginTop: 4 }}>{help}</p>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className="ui-kv-value" style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Fa } from './Fa';

// Pieces of the Loadpopupv_2 design shared by the New Load and New Invoice
// popups (styles in styles/newload.css, under .nl).

export function Seg({ name, value, options, onChange, className = '', label }: {
  name: string; value: string; options: { value: string; label: string; aria?: string }[]; onChange: (v: string) => void; className?: string; label: string;
}) {
  return (
    <div className={`nl-rseg ${className}`} role="radiogroup" aria-labelledby={label}>
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} aria-label={o.aria} onChange={() => onChange(o.value)} />
          <span className="nl-rseg-btn">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function SecHead({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="nl-sec-head">
      {right ? <div className="nl-sec-headrow"><h2>{title}</h2>{right}</div> : <h2>{title}</h2>}
      <p>{sub}</p>
    </div>
  );
}

export const Req = () => <span className="nl-req" aria-hidden="true">*</span>;

interface ComboProps<T> {
  id: string;
  value: string;
  onQuery: (q: string) => void;
  items: (q: string) => T[];
  keyOf: (item: T) => string;
  render: (item: T, q: string) => ReactNode;
  onPick: (item: T) => void;
  placeholder: string;
  listLabel: string;
  none: (q: string) => string;
  icon: IconDefinition;
  padLeft?: 'nl-pl-9' | 'nl-pl-10';
  between?: boolean;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  extraClass?: string;
  after?: ReactNode;
  // False: the box shows a chosen name, so the list is not narrowed by it.
  searchFromValue?: boolean;
}

// A search box with a list under it (customer, carrier, LTL load, truck):
// typing narrows the list, arrows and Enter or a click pick, Escape closes it.
export function Combo<T>(p: ComboProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = p.value.trim();
  const query = p.searchFromValue === false ? '' : q;
  const items = open ? p.items(query) : [];
  const listId = `nl-${p.id}-list`;
  const shownActive = Math.min(active, items.length - 1);

  useEffect(() => {
    if (open && shownActive >= 0) document.getElementById(`${listId}-${shownActive}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, shownActive, listId]);

  const pick = (it: T) => {
    setOpen(false);
    p.onPick(it);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setActive(0); setOpen(true); } else setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      if (open && items[shownActive]) { e.preventDefault(); pick(items[shownActive]); }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="nl-rel">
      <span className="nl-in-ico"><Fa icon={p.icon} /></span>
      <input
        ref={inputRef} id={`nl-${p.id}`} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-required={p.required || undefined} aria-invalid={p.invalid ? 'true' : 'false'} aria-describedby={p.describedBy}
        aria-activedescendant={open && shownActive >= 0 && items.length ? `${listId}-${shownActive}` : undefined}
        className={`nl-inp ${p.padLeft ?? 'nl-pl-9'}${p.extraClass ? ` ${p.extraClass}` : ''}`} placeholder={p.placeholder} autoComplete="off"
        value={p.value}
        onChange={(e) => { p.onQuery(e.target.value); setActive(0); setOpen(true); }}
        onClick={() => { if (!open) { setActive(-1); setOpen(true); } }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {p.after}
      {open && (
        <ul id={listId} role="listbox" aria-label={p.listLabel} className="nl-list" onMouseDown={(e) => e.preventDefault()}>
          {items.length ? items.map((it, i) => (
            <li
              key={p.keyOf(it)} id={`${listId}-${i}`} role="option" aria-selected={i === shownActive}
              className={`nl-opt-row${p.between ? ' is-between' : ''}${i === shownActive ? ' is-active' : ''}`}
              onClick={() => pick(it)}
            >
              {p.render(it, query)}
            </li>
          )) : <li className="nl-opt-none">{p.none(q)}</li>}
        </ul>
      )}
    </div>
  );
}

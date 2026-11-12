import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { faChevronDown, faCheck } from '@fortawesome/free-solid-svg-icons';
import { PERIODS, type Period } from '../data/insights';
import { useDismiss } from '../lib/useDismiss';
import { Fa } from './Fa';

// The Dashboard's period (release 1.33): a button showing the period chosen,
// opening a short list of the four (YTD, One year, One month, One week).
export function PeriodMenu({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close, button);
  const current = PERIODS.find((p) => p.key === value) ?? PERIODS[3];

  const choose = (p: Period) => {
    onChange(p);
    setOpen(false);
    button.current?.focus();
  };
  // Up and down move through the list; Enter or Space picks.
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'))];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };

  return (
    <div className="dash-pmenu" ref={wrap}>
      <button
        ref={button} type="button" className={`ui-btn dash-pmenu-btn${open ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Period: ${current.label}`}
        onClick={() => {
          setOpen(!open);
          if (!open) window.setTimeout(() => wrap.current?.querySelector<HTMLButtonElement>('.is-on')?.focus(), 0);
        }}
      >
        <span>{current.label}</span>
        <Fa icon={faChevronDown} className="dash-pmenu-chev" />
      </button>
      {open && (
        <ul className="dash-pmenu-list" role="listbox" aria-label="Period" onKeyDown={onListKey}>
          {PERIODS.map((p) => (
            <li key={p.key} role="option" aria-selected={p.key === value}>
              <button type="button" className={p.key === value ? 'is-on' : ''} onClick={() => choose(p.key)}>
                <span>{p.label}</span>
                <small>{p.short}</small>
                {p.key === value && <Fa icon={faCheck} className="dash-pmenu-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

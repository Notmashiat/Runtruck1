import { useId, useRef, useState, type KeyboardEvent } from 'react';

export interface PickOption {
  value: string;
  // Shown in the list and in the box (the value when absent).
  label?: string;
  // A second, muted line: what else to know about it (and searched too).
  hint?: string;
}

interface SearchSelectProps {
  value: string;
  options: PickOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  // A first choice that clears the value ("None yet").
  emptyLabel?: string;
  invalid?: boolean;
  // A last row for adding a record that is not in the list yet, given what was typed.
  addLabel?: (query: string) => string;
  onAdd?: (query: string) => void;
  // A plain dropdown instead (for companies that do not have the release yet).
  plain?: boolean;
}

const MAX_SHOWN = 100;

// A dropdown you can type in: clicking it lists everything, typing narrows the
// list (by label and hint), and arrows + Enter or a click picks. What was typed
// without picking is dropped when the box loses focus, so the value is always
// one of the options (or what it already was).
export function SearchSelect({ value, options, onChange, ariaLabel, placeholder, emptyLabel, invalid, addLabel, onAdd, plain }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);
  const shownLabel = current ? current.label ?? current.value : value;

  if (plain) {
    return (
      <select className={`ui-input${invalid ? ' is-bad' : ''}`} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel ?? placeholder ?? 'Select'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
        {value && !current && <option value={value}>{value}</option>}
      </select>
    );
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options
    .filter((o) => {
      const text = `${o.label ?? o.value} ${o.hint ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .slice(0, MAX_SHOWN);
  // The rows, in order: the clearing choice, the matches, then Add.
  type Row = { kind: 'empty' } | { kind: 'option'; option: PickOption } | { kind: 'add' };
  const rows: Row[] = [
    ...(emptyLabel && !words.length ? [{ kind: 'empty' } as Row] : []),
    ...matches.map((option) => ({ kind: 'option', option }) as Row),
    ...(onAdd ? [{ kind: 'add' } as Row] : []),
  ];

  const show = () => {
    setOpen(true);
    setQuery('');
    // Start on the chosen option, so arrows move from there.
    const at = rows.findIndex((r) => r.kind === 'option' && r.option.value === value);
    setActive(Math.max(0, at));
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'add') onAdd?.(query.trim());
    else onChange(row.kind === 'empty' ? '' : row.option.value);
    close();
    if (row.kind !== 'add') inputRef.current?.blur();
  };
  const move = (to: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, to));
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show();
      else move(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      pick(rows[active]);
    } else if (e.key === 'Escape' && open) {
      // Close the list only, not the popup it is in.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className={`ui-pick${open ? ' is-open' : ''}`}>
      <input
        ref={inputRef}
        className={`ui-input${invalid ? ' is-bad' : ''}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={open ? query : shownLabel}
        placeholder={open ? shownLabel || placeholder : placeholder}
        // Opens on a click, typing or an arrow key, not on focus alone, so focus
        // coming back from a popup (Add facility) does not drop the list open.
        onClick={() => { if (!open) show(); }}
        // Typing into a closed box replaces the name shown, rather than adding to it.
        onFocus={(e) => e.currentTarget.select()}
        onBlur={close}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <span className="ui-pick-chevron" aria-hidden="true">▾</span>
      {open && (
        // Clicks on the list must not take focus from the box (that would close it first).
        <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="ui-pick-list" onMouseDown={(e) => e.preventDefault()}>
          {!matches.length && <li className="ui-pick-none" role="presentation">No matches{query.trim() ? ` for “${query.trim()}”` : ''}</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === 'option' ? row.option.value : row.kind}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={row.kind === 'option' ? row.option.value === value : row.kind === 'empty' && !value}
              className={`ui-pick-row${i === active ? ' is-active' : ''}${row.kind === 'add' ? ' is-add' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(row)}
            >
              {row.kind === 'empty' && <span className="ui-pick-label is-muted">{emptyLabel}</span>}
              {row.kind === 'option' && (
                <>
                  <span className="ui-pick-label">{row.option.label ?? row.option.value}</span>
                  {row.option.hint && <span className="ui-pick-hint">{row.option.hint}</span>}
                </>
              )}
              {row.kind === 'add' && <span className="ui-pick-label">+ {addLabel ? addLabel(query.trim()) : 'Add new'}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

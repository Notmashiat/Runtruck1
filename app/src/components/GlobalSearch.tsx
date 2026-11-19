import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { faBoxOpen, faBuilding, faIdCard, faMagnifyingGlass, faTrailer, faTruck, faWarehouse, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import { HIT_LABEL, isSearchShortcut, searchAll, type Hit, type HitKind } from '../lib/globalSearch';
import { Fa } from './Fa';
import { hl } from './highlight';

// The top bar's search (release 1.48). Typing still narrows the list on the
// page (as before), and a list under the box shows what matches across the
// app — loads, trucks, trailers, drivers, customers and brokers, facilities.
// Arrows and Enter (or a click) open one; '/' anywhere opens the search.

const ICON: Record<HitKind, IconDefinition> = {
  load: faBoxOpen, truck: faTruck, trailer: faTrailer, driver: faIdCard, customer: faBuilding, facility: faWarehouse,
};

// `compact`: a short hint, where the bar is shared (a load's page).
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const { searchText, setQuery, loads, trucks, trailers, drivers, customers, facilities } = useAppShell();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(
    () => searchAll(searchText, { loads, trucks, trailers, drivers, customers, facilities }),
    [searchText, loads, trucks, trailers, drivers, customers, facilities],
  );
  const shown = Math.min(active, Math.max(0, hits.length - 1));

  // '/' anywhere (outside a field, with no popup open) opens the search.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isSearchShortcut(e, e.target) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (h: Hit) => {
    setOpen(false);
    setQuery(h.filter);
    navigate(h.to);
    input.current?.blur();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && hits[shown]) { e.preventDefault(); pick(hits[shown]); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (open && hits.length) setOpen(false);
      else { setQuery(''); input.current?.blur(); }
    }
  };

  const listOpen = open && searchText.trim().length > 0;
  return (
    <label ref={wrap} className="ui-island ui-topbar-left ui-search-island">
      <Fa icon={faMagnifyingGlass} className="ui-search-icon" />
      <input
        ref={input} className="ui-search" type="search" value={searchText}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        placeholder={compact ? 'Search' : 'Search by load number, broker, truck etc.'}
        aria-label="Search by load number, broker, truck and more" role="combobox" aria-autocomplete="list"
        aria-expanded={listOpen} aria-controls="ui-search-list" aria-keyshortcuts="/"
        aria-activedescendant={listOpen && hits[shown] ? `ui-search-${hits[shown].key}` : undefined}
        autoComplete="off" spellCheck={false}
      />
      {!searchText && <kbd className="ui-search-key" aria-hidden="true">/</kbd>}
      {listOpen && (
        <div className="ui-search-pop" onMouseDown={(e) => e.preventDefault()}>
          {hits.length === 0 ? (
            <p className="ui-search-none">Nothing matches “{searchText.trim()}”. Try a load or truck number, a driver, a broker or a city.</p>
          ) : (
            <ul id="ui-search-list" role="listbox" aria-label="Search results">
              {hits.map((h, i) => {
                const heading = i === 0 || hits[i - 1].kind !== h.kind ? HIT_LABEL[h.kind] : '';
                return (
                  <li key={h.key} role="presentation">
                    {heading && <div className="ui-search-group" aria-hidden="true">{heading}</div>}
                    <div
                      id={`ui-search-${h.key}`} role="option" aria-selected={i === shown}
                      className={`ui-search-hit${i === shown ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => pick(h)}
                    >
                      <span className="ui-search-hit-ico"><Fa icon={ICON[h.kind]} /></span>
                      <span className="ui-search-hit-text">
                        <b>{hl(h.title, searchText.trim())}</b>
                        <span>{h.sub}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="ui-search-foot"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
        </div>
      )}
    </label>
  );
}

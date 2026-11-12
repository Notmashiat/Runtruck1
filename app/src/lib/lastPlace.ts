// Where each page was left (release 1.38): open Loads › Delivered, go to
// Fleet, come back to Loads and it is still on Delivered. Remembered for the
// day only — the next day every page opens on its usual first tab again.
// Kept per person, on this device.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { currentSession } from './auth';
import { todayIso } from './clock';
import { readJson, writeJson } from './storage';

const KEY = 'runtruck-last-place';

interface Saved { day: string; who: string; places: Record<string, string> }

const who = () => {
  const s = currentSession();
  return s ? `${s.companyId}:${s.memberId}` : '';
};

// The section a page belongs to ('loads', 'fleet', …), or '' for pages that
// have no tabs to come back to.
export function sectionOf(pathname: string): string {
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  if (parts[0] !== 'app' || !parts[1]) return '';
  // A single load's page is not a place in the list to go back to.
  if (parts[1] === 'loads' && parts.length > 2) return '';
  if (parts[1] === 'dashboard') return '';
  return parts[1];
}

// Today's places for this person (nothing from another day or person).
export function placesToday(saved: Saved | null, day: string, person: string): Record<string, string> {
  return saved && saved.day === day && saved.who === person && saved.places && typeof saved.places === 'object' ? saved.places : {};
}

// This window's own places (release 1.38): two windows side by side each
// come back to where they were; a new window starts from the browser's.
function windowSaved(): Saved | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null;
  } catch {
    return null;
  }
}

// Where a section was left today, if anywhere: in this window first.
export function lastPlace(section: string): string | null {
  const day = todayIso();
  const person = who();
  const place = placesToday(windowSaved(), day, person)[section] ?? placesToday(readJson<Saved>(KEY), day, person)[section];
  return typeof place === 'string' && place.toLowerCase().startsWith(`/app/${section}`) ? place : null;
}

// Notes every page the person opens (in the app's frame).
export function useRememberPlace() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const section = sectionOf(pathname);
    if (!section) return;
    const day = todayIso();
    const person = who();
    const here = `${pathname}${search}`;
    const mine = placesToday(windowSaved(), day, person);
    if (mine[section] !== here) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ day, who: person, places: { ...mine, [section]: here } } satisfies Saved));
      } catch {
        // Storage blocked: the browser-wide record below still works.
      }
    }
    const places = placesToday(readJson<Saved>(KEY), day, person);
    if (places[section] === here) return;
    writeJson(KEY, { day, who: person, places: { ...places, [section]: here } } satisfies Saved);
  }, [pathname, search]);
}

// The address to open a section at: where it was left today when that tab is
// still allowed (`may` checks a permission), otherwise its usual address.
export function openAt(section: string, may: (perm: string) => boolean): string {
  const place = lastPlace(section);
  if (!place) return `/app/${section}`;
  const tab = place.split('?')[0].split('/')[3];
  return !tab || may(`${section}/${tab}`) ? place : `/app/${section}`;
}

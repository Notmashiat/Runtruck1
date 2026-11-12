// Screens are downloaded the first time they are opened (see App.tsx). When
// RunTruck is updated, the files an open tab knows about no longer exist on
// the server, so opening a new screen in that tab fails to download. The
// fix is to reload once, which fetches the new version; if the download
// still fails (offline), the error boundary explains and offers a reload.
import { lazy, type ComponentType } from 'react';
import { isLoadFailure } from './errorLog';

const RELOADS_KEY = 'runtruck-reloads';
// Right after RunTruck is updated, a new file can take a little while to
// reach every server, so one failed download is not the end: try the download
// again in place, then reload up to three times in two minutes (waiting a bit
// longer each time) before the error boundary explains and offers a reload.
const RETRY_AFTER_MS = 1500;
const RELOAD_WINDOW_MS = 120_000;
const MAX_RELOADS = 3;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

// Reload to fetch the newest files, unless that has already been tried
// MAX_RELOADS times in the last RELOAD_WINDOW_MS (then false: it would only
// loop). The first reload is at once; later ones wait 2 s, then 4 s.
export function reloadForNewVersion(): boolean {
  let times: number[];
  try {
    const saved = JSON.parse(sessionStorage.getItem(RELOADS_KEY) ?? '[]') as unknown;
    times = Array.isArray(saved) ? saved.filter((t): t is number => typeof t === 'number' && Date.now() - t < RELOAD_WINDOW_MS) : [];
    if (times.length >= MAX_RELOADS) return false;
    sessionStorage.setItem(RELOADS_KEY, JSON.stringify([...times, Date.now()]));
  } catch {
    // Storage blocked: no way to know how often it has reloaded, so don't.
    return false;
  }
  window.setTimeout(() => window.location.reload(), times.length * 2000);
  return true;
}

function reloadSoon(error: unknown): Promise<never> {
  // Reloaded enough times already and it still fails: stop, and show the error.
  if (!isLoadFailure(error) || !reloadForNewVersion()) throw error;
  // Keep the "Loading…" state on screen until the reload takes over.
  return new Promise<never>(() => undefined);
}

// The app's stylesheet has loaded when its colour tokens exist. Opened while
// a new version is reaching every server, the page can get the scripts but
// not the stylesheet, and shows as plain, unstyled text.
export function stylesMissing(): boolean {
  return !getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim();
}

// Download a screen; if that fails, once more after a moment, then reload.
export function loadWithRetry<M>(load: () => Promise<M>): Promise<M> {
  return load()
    .catch((error: unknown) => {
      if (!isLoadFailure(error)) throw error;
      return wait(RETRY_AFTER_MS).then(load);
    })
    .catch(reloadSoon);
}

// The exports of a module that are components.
type ComponentKeys<M> = { [K in keyof M]: M[K] extends ComponentType<never> ? K : never }[keyof M];
type PropsOf<C> = C extends ComponentType<infer P> ? P : never;

// lazy() for a named export: lazyNamed(() => import('./pages/X'), 'X').
export function lazyNamed<M, K extends ComponentKeys<M>>(load: () => Promise<M>, name: K) {
  return lazy(() => loadWithRetry(load).then((m) => ({ default: m[name] as ComponentType<PropsOf<M[K]>> })));
}

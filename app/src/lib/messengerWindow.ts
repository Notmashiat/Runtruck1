// Messages in a window of its own (release 1.43): the messenger pops out into
// a slim browser window at the right of the screen. Chats stay in step through
// the shared store (lib/messengerStore.ts); this channel carries the rest
// between the pop-out and the RunTruck window: open a page there, save an
// attachment to a load there (it needs the room), put Messages back, and a
// heartbeat so the app knows Messages is popped out.
import type { BillDocument } from '../data/bills';

const CHANNEL = 'runtruck-messenger-window';
export const WINDOW_NAME = 'runtruck-messages';
export const WINDOW_PATH = '/messages';

export type WindowMessage =
  | { type: 'alive' }
  | { type: 'gone' }
  | { type: 'focus' }
  | { type: 'dock' }
  | { type: 'navigate'; to: string }
  | { type: 'save'; doc: BillDocument; from: string };

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function post(msg: WindowMessage) {
  const c = channel();
  c?.postMessage(msg);
  c?.close();
}

export function listen(fn: (msg: WindowMessage) => void): () => void {
  const c = channel();
  if (!c) return () => undefined;
  c.onmessage = (e: MessageEvent<WindowMessage>) => fn(e.data);
  return () => c.close();
}

// Open (or bring forward) the pop-out: slim and tall, at the right edge.
// Null when the browser blocked it.
export function popOut(): Window | null {
  const scr = window.screen;
  const width = Math.min(400, scr.availWidth);
  const height = Math.max(520, Math.min(scr.availHeight - 60, 960));
  const left = Math.max(0, (scr as Screen & { availLeft?: number }).availLeft ?? 0) + scr.availWidth - width - 16;
  const top = Math.max(0, (scr as Screen & { availTop?: number }).availTop ?? 0) + 24;
  const w = window.open(WINDOW_PATH, WINDOW_NAME, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  w?.focus();
  return w;
}

// The RunTruck window that opened this pop-out, if it is still there.
export function mainWindow(): Window | null {
  try {
    return window.opener && !(window.opener as Window).closed ? (window.opener as Window) : null;
  } catch {
    return null;
  }
}

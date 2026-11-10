// A short message in the corner of the app ("Load L-40222 created for …").
// Kept outside the page that shows it, so it outlives a popup that closes.
// components/Toaster.tsx draws it.

export interface ToastMessage {
  id: number;
  text: string;
  kind: 'done' | 'info';
}

type Listener = (t: ToastMessage) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function toast(text: string, kind: ToastMessage['kind'] = 'done') {
  const t = { id: ++seq, text, kind };
  listeners.forEach((l) => l(t));
}

export function onToast(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

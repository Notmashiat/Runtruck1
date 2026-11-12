import { useEffect, type RefObject } from 'react';

// Closes a dropdown when the person clicks or taps outside it, or presses
// Escape (which also puts the focus back on the button that opened it).
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void, button?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
      button?.current?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [ref, open, close, button]);
}

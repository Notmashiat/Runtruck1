import { Fragment, createElement, type ReactNode } from 'react';

// The text with the part that matches the search highlighted (the search
// lists in New Load and New Invoice).
export function hl(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return createElement(Fragment, null, text.slice(0, i), createElement('mark', null, text.slice(i, i + q.length)), text.slice(i + q.length));
}

import { useEffect, useState } from 'react';

// The Dashboard's opening animation (release 1.37): numbers count up from 0,
// the on-time dial fills from left to right and the profit graph is drawn in
// from the left, each time the Dashboard is opened. People who ask for less
// motion (a system setting) see the finished values straight away.

const reduced = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

// 0 → 1 over `ms` from when the component first appears (eased), then stays at 1.
export function useIntro(ms = 900): number {
  const [p, setP] = useState(() => (reduced() || typeof requestAnimationFrame === 'undefined' ? 1 : 0));
  useEffect(() => {
    if (p >= 1) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setP(easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // A background tab pauses animation frames: never leave a number short.
    const finish = window.setTimeout(() => setP(1), ms + 400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
    // Runs once, when the component appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

// Every number in `text` scaled by `p`, written the way it was written
// ('$28.1K' → '$14.1K', '1,779' → '890'). A number after '/' (the 7 in
// '4/7') is a total and stays as it is.
export function scaleNumbers(text: string, p: number): string {
  if (p >= 1) return text;
  return text.replace(/(\/\s*)?(\d[\d,]*(?:\.\d+)?)/g, (all, slash: string | undefined, num: string) => {
    if (slash) return all;
    const decimals = num.includes('.') ? num.split('.')[1].length : 0;
    const value = Number(num.replace(/,/g, '')) * p;
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: num.includes(',') });
  });
}

// A value that counts up when it first appears; later changes show at once.
export function CountUp({ text, ms = 900 }: { text: string; ms?: number }) {
  const p = useIntro(ms);
  // The finished value is read out, not every step.
  return p >= 1 ? <>{text}</> : <><span className="count-sr">{text}</span><span aria-hidden="true">{scaleNumbers(text, p)}</span></>;
}

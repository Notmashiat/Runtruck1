import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { compactUsd } from '../data/metrics';
import { fmtDate } from '../data/invoicing';
import { daysLate, type Delivery, type ProfitPoint } from '../data/insights';
import { CountUp, useIntro } from './CountUp';

// The Dashboard's two drawn insights (release 1.32): the profit graph (this
// period against the one before, with a tooltip that follows the pointer) and
// the on-time delivery gauge.

const money = (n: number) => (n < 0 ? `−${compactUsd(-n)}` : compactUsd(n));
// '5K', '12.5K', '1.2M', '−10K' for the value axis.
function axisMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const trim = (v: number) => String(Number(v.toFixed(1)));
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}K`;
  return `${sign}${Math.round(a)}`;
}

// Round steps for the value axis (1, 2, 2.5 or 5 times a power of ten).
function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

// A smooth line through the points that never overshoots them (monotone
// cubic, Fritsch–Carlson), so a curve does not invent highs or lows.
export function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)},${f(p.y)}`).join(' ');
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x || 1));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let out = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (pts[i + 1].x - pts[i].x) / 3;
    out += ` C${f(pts[i].x + dx)},${f(pts[i].y + m[i] * dx)} ${f(pts[i + 1].x - dx)},${f(pts[i + 1].y - m[i + 1] * dx)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return out;
}

// The size an element is drawn at, kept up to date.
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface Delta { text: string; title: string; good: boolean }

export function ProfitChart({ points, total, delta, previousLabel }: { points: ProfitPoint[]; total: number; delta: Delta | null; previousLabel: string }) {
  const [plotRef, { w, h }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const values = points.flatMap((p) => [p.current, p.previous]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const pad = { l: 44, r: 10, t: 10, b: 24 };
  const iw = Math.max(1, w - pad.l - pad.r);
  const ih = Math.max(1, h - pad.t - pad.b);
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const line = (key: 'current' | 'previous') => smoothPath(points.map((p, i) => ({ x: x(i), y: y(p[key]) })));
  // Release 1.37: the lines are drawn in from the left when the Dashboard opens.
  const reveal = useIntro(1100);
  const area = n ? `${line('current')} L${x(n - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z` : '';
  // Every date for a week; five spread out otherwise.
  const labelAt = n <= 8 ? points.map((_, i) => i) : [...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4)))];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * w;
    setActive(Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((a) => Math.max(0, Math.min(n - 1, (a ?? (step > 0 ? -1 : n)) + step)));
    } else if (e.key === 'Escape') setActive(null);
  };
  const p = active !== null ? points[active] : null;
  const tipLeft = active !== null ? x(active) : 0;

  return (
    <div className="pchart">
      <div className="pchart-stat">
        <div className="pchart-total"><CountUp text={money(total)} /></div>
        {delta && (
          <div className="pchart-delta">
            <span className={`pchart-chip${delta.good ? ' is-good' : ' is-bad'}`} title={delta.title}>{delta.text}</span>
            <span>vs. {previousLabel}</span>
          </div>
        )}
        <div className="pchart-legend">
          <span><i className="is-now" />This period</span>
          <span><i className="is-before" />Previous period</span>
        </div>
      </div>
      <div
        className="pchart-plot" ref={plotRef} tabIndex={0} role="group"
        aria-label={`Profit through the period, ${money(total)} in total. Use the left and right arrow keys to read each point.`}
        onKeyDown={onKey} onBlur={() => setActive(null)}
      >
        {w > 0 && h > 0 && (
          <svg width={w} height={h} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)} aria-hidden="true">
            <defs>
              <linearGradient id="pchart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ui-primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--ui-primary)" stopOpacity="0" />
              </linearGradient>
              <clipPath id="pchart-reveal">
                <rect x="0" y="0" width={reveal >= 1 ? w : pad.l + iw * reveal} height={h} />
              </clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className={`pchart-grid${t === 0 ? ' is-zero' : ''}`} />
                <text x={pad.l - 8} y={y(t)} className="pchart-ylabel" textAnchor="end" dominantBaseline="middle">{axisMoney(t)}</text>
              </g>
            ))}
            {labelAt.map((i) => (
              <text key={i} x={x(i)} y={h - 4} className="pchart-xlabel" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{points[i]?.axis}</text>
            ))}
            {n > 0 && (
              <g clipPath="url(#pchart-reveal)">
                <path d={area} fill="url(#pchart-fill)" />
                <path d={line('previous')} className="pchart-line is-before" />
                <path d={line('current')} className="pchart-line is-now" />
              </g>
            )}
            {p && active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + ih} className="pchart-cursor" />
                <circle cx={x(active)} cy={y(p.previous)} r="3.5" className="pchart-dot is-before" />
                <circle cx={x(active)} cy={y(p.current)} r="5" className="pchart-dot is-now" />
              </g>
            )}
          </svg>
        )}
        {p && (
          <div className={`pchart-tip${tipLeft > w * 0.6 ? ' is-left' : ''}`} style={{ left: tipLeft }} aria-live="polite">
            <div className="pchart-tip-date">{p.title}</div>
            <div><i className="is-now" /><b>{money(p.current)}</b> this period</div>
            <div><i className="is-before" /><b>{money(p.previous)}</b> previous period</div>
          </div>
        )}
      </div>
    </div>
  );
}

// The on-time gauge: a half circle of ticks filled to the on-time share, with
// a mark at the target; Show details turns the card to that period's late loads.
//
// Release 1.37: the dial keeps its shape at every card size — the number and
// the line under it are sized from the dial itself and sit inside the arc —
// and it fills from left to right when the Dashboard opens.
const TICKS = 40;

export function LateRow({ l }: { l: Delivery }) {
  return (
    <div className="dash-row is-two-line">
      <span className="dash-dot is-amber" />
      <span className="dash-row-label">{l.customer} · {l.lane}</span>
      <span className="dash-row-value">{daysLate(l)} d late</span>
      <span className="dash-row-meta">Booked {fmtDate(l.scheduled, true)} · delivered {fmtDate(l.delivered, true)}</span>
    </div>
  );
}

export function OnTimeGauge({ rate, onTime, timed, target, delta, late, short }: {
  rate: number; onTime: number; timed: number; target: number; delta: Delta | null; late: Delivery[]; short: string;
}) {
  const [details, setDetails] = useState(false);
  const intro = useIntro(1100);
  if (details) {
    return (
      <div className="gauge-details">
        <div className="gauge-details-head">
          <span>{onTime} of {timed} loads on time · {short}</span>
          <button type="button" className="ui-btn ui-btn-sm" onClick={() => setDetails(false)}>Back</button>
        </div>
        {late.length === 0 ? (
          <div className="dash-empty">Every load in this period was on time.</div>
        ) : (
          <div className="dash-list">
            {late.slice(0, 20).map((l) => <LateRow key={l.id} l={l} />)}
          </div>
        )}
      </div>
    );
  }
  const tone = !timed ? 'is-none' : rate >= target ? 'is-good' : rate >= 0.85 ? 'is-ok' : 'is-bad';
  const shown = rate * intro;
  const filled = timed ? Math.round(shown * TICKS) : 0;
  const cx = 100;
  const cy = 104;
  const tick = (k: number, r1: number, r2: number) => {
    const a = Math.PI - (k / (TICKS - 1)) * Math.PI;
    return { x1: cx + r1 * Math.cos(a), y1: cy - r1 * Math.sin(a), x2: cx + r2 * Math.cos(a), y2: cy - r2 * Math.sin(a) };
  };
  const targetTick = tick(Math.round(target * (TICKS - 1)), 93, 101);
  const pct = Math.round(rate * 100);
  return (
    <div className={`gauge ${tone}`}>
      <div className="gauge-arc">
        <div className="gauge-dial">
          <svg viewBox="-6 -4 212 114" aria-hidden="true">
            {Array.from({ length: TICKS }, (_, k) => {
              const t = tick(k, 66, 90);
              const on = k < filled;
              return <line key={k} {...t} className={on ? 'gauge-on' : 'gauge-off'} style={on ? { opacity: 0.35 + (0.65 * k) / TICKS } : undefined} />;
            })}
            <line {...targetTick} className="gauge-target" />
          </svg>
          <div className="gauge-center" role="img" aria-label={timed ? `${pct}% of loads delivered on time, ${short}; the target is ${Math.round(target * 100)}%` : `No deliveries ${short}`}>
            <div className="gauge-value" aria-hidden="true">{timed ? `${Math.round(shown * 100)}%` : '—'}</div>
            <div className="gauge-sub" aria-hidden="true">
              {!timed ? `No deliveries · ${short}` : rate >= target ? `On target · ${Math.round(target * 100)}% goal` : `Below the ${Math.round(target * 100)}% target`}
            </div>
          </div>
        </div>
      </div>
      <div className="gauge-foot">
        {delta && <div className={`gauge-delta${delta.good ? ' is-good' : ' is-bad'}`} title={delta.title}>{delta.text}</div>}
        <button type="button" className="ui-btn ui-btn-sm" onClick={() => setDetails(true)}>Show details</button>
      </div>
    </div>
  );
}

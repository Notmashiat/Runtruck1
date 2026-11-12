import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import type { WidgetId } from '../data/dashboard';
import { demoHistory } from '../data/demoHistory';
import {
  ON_TIME_TARGET, change, costsFromBills, deliveriesFromLoads, lanesByProfit, onTimeByCustomer, onTimeRate, periodOf, periodRange,
  previousRange, profitSeries, summarize, type Cost, type Delivery, type Period,
} from '../data/insights';
import { LateRow, OnTimeGauge, ProfitChart } from './DashboardCharts';
import { CountUp, useIntro } from './CountUp';
import { TODAY, usd0 } from '../data/invoicing';
import { compactUsd } from '../data/metrics';
import { ACTIVE_STATUSES } from '../data/mock';

// The Dashboard's insight widgets (release 1.31). Every figure but Active
// trucks follows the period chosen beside Customize, and the numbers compare
// themselves with the period before.

// Statuses a truck is out working in (not just booked or waiting on a driver).
const ROLLING = ['Dispatched', 'At pickup', 'In transit', 'Delayed'];

// Everything the widgets show, worked out once per change of records or period.
export function useDashboardData(period: Period) {
  const { loads, bills, trucks } = useAppShell();
  const records = useMemo(() => {
    const demo = demoHistory(bills);
    const deliveries: Delivery[] = [...demo.deliveries, ...deliveriesFromLoads(loads)];
    const costs: Cost[] = [...demo.costs, ...costsFromBills(bills)];
    return { deliveries, costs };
  }, [loads, bills]);
  return useMemo(() => {
    const range = periodRange(period, TODAY);
    const fleet = trucks.filter((t) => !t.archived);
    const onLoad = new Set(loads.filter((l) => ROLLING.includes(l.status)).map((l) => l.unit.split('/')[0].trim()).filter((u) => u && u !== '—'));
    return {
      period,
      range,
      now: summarize(records.deliveries, records.costs, range),
      before: summarize(records.deliveries, records.costs, previousRange(period, TODAY)),
      deliveries: records.deliveries,
      costs: records.costs,
      fleet,
      activeTrucks: fleet.filter((t) => onLoad.has(t.unit)),
      openLoads: loads.filter((l) => ACTIVE_STATUSES.includes(l.status)).length,
    };
  }, [records, loads, trucks, period]);
}

export type DashData = ReturnType<typeof useDashboardData>;

export interface KpiView {
  kind: 'kpi';
  label: string;
  value: string;
  note: string;
  to: string;
  // The change against the period before (up is good unless `lowerIsBetter`).
  delta?: { text: string; title: string; good: boolean } | null;
}

export interface CardView {
  kind: 'card';
  title: string;
  action?: ReactNode;
  flush?: boolean;
  body: ReactNode;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
// '$52.8K', or '−$219' for a loss.
const money = (n: number) => (n < 0 ? `−${compactUsd(-n)}` : compactUsd(n));
const perMile = (n: number) => (n ? `$${n.toFixed(2)}` : '—');

// '▲ 8%' / '▼ 3%' against the period before; null when there is nothing to compare.
function deltaOf(now: number, before: number, d: DashData): KpiView['delta'] {
  const c = change(now, before);
  if (c === null || !Number.isFinite(c)) return null;
  const arrow = c >= 0 ? '▲' : '▼';
  const text = `${arrow} ${Math.abs(Math.round(c * 100))}%`;
  return { text, title: `${text} vs ${periodOf(d.period).previous}`, good: c >= 0 };
}

// — the numbers —

export function kpiFor(id: WidgetId, d: DashData): KpiView | null {
  const { now, before } = d;
  const short = periodOf(d.period).short;
  switch (id) {
    case 'kpi-revenue':
      return {
        kind: 'kpi', label: 'Revenue', value: compactUsd(now.revenue), to: '/app/accounting/invoiced',
        note: `${now.loads} loads delivered · ${short}`, delta: deltaOf(now.revenue, before.revenue, d),
      };
    case 'kpi-profit':
      return {
        kind: 'kpi', label: 'Profit', value: money(now.profit), to: '/app/accounting/bills',
        note: now.revenue ? `${pct(now.margin)} margin · costs ${compactUsd(now.revenue - now.profit)}` : `Nothing delivered · ${short}`,
        delta: deltaOf(now.profit, before.profit, d),
      };
    case 'kpi-trucks': {
      const inShop = d.fleet.filter((t) => t.status !== 'In service').length;
      return {
        kind: 'kpi', label: 'Active trucks', value: `${d.activeTrucks.length}/${d.fleet.length}`, to: '/app/fleet/trucks',
        note: `On a load right now · ${inShop} in shop or due for service`, delta: null,
      };
    }
    case 'kpi-delivered':
      return {
        kind: 'kpi', label: 'Loads delivered', value: String(now.loads), to: '/app/loads',
        note: `${now.late.length} late · ${now.miles.toLocaleString('en-US')} miles · ${short}`, delta: deltaOf(now.loads, before.loads, d),
      };
    case 'kpi-rpm':
      return {
        kind: 'kpi', label: 'Revenue per mile', value: perMile(now.revenuePerMile), to: '/app/loads',
        note: `Each mile cost ${perMile(now.costPerMile)} · ${short}`, delta: deltaOf(now.revenuePerMile, before.revenuePerMile, d),
      };
    default:
      return null;
  }
}

// — cards —

function HBars({ rows, empty }: { rows: { key: string; value: number; label: string; meta?: string }[]; empty: string }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  const grow = useIntro();
  if (rows.length === 0) return <div className="dash-empty">{empty}</div>;
  return (
    <div className="dash-list">
      {rows.map((r) => (
        <div key={r.key} className="dash-hbar">
          <div className="dash-hbar-top">
            <span className="dash-row-label">{r.key}</span>
            {r.meta && <span className="dash-row-meta">{r.meta}</span>}
            <span className="dash-row-value"><CountUp text={r.label} /></span>
          </div>
          <div className="dash-hbar-track"><span style={{ width: `${Math.max(0, r.value / top) * 100 * grow}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function OnTimeByCustomer({ d }: { d: DashData }) {
  const rows = onTimeByCustomer(d.deliveries, d.range);
  const grow = useIntro();
  if (rows.length === 0) return <div className="dash-empty">No deliveries in this period.</div>;
  return (
    <table className="ui-table dash-table">
      <thead>
        <tr><th>Customer</th><th className="num">Loads</th><th className="num">Late</th><th className="num">Avg. late</th><th>On time</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const rate = r.onTime / r.loads;
          const tone = rate >= 0.95 ? 'is-good' : rate >= 0.88 ? 'is-ok' : 'is-bad';
          return (
            <tr key={r.customer}>
              <td className="strong">{r.customer}</td>
              <td className="num">{r.loads}</td>
              <td className="num">{r.late}</td>
              <td className="num">{r.late ? `${r.avgDaysLate.toFixed(1)} d` : '—'}</td>
              <td>
                <div className={`dash-rate ${tone}`}>
                  <div className="dash-rate-track"><span style={{ width: pct(rate * grow) }} /></div>
                  <b><CountUp text={pct(rate)} /></b>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LateLoads({ d }: { d: DashData }) {
  const late = d.now.late.slice(0, 12);
  if (late.length === 0) return <div className="dash-empty">Every load in this period was on time.</div>;
  return <div className="dash-list">{late.map((l) => <LateRow key={l.id} l={l} />)}</div>;
}

const muted = (s: string) => <span className="dash-head-meta">{s}</span>;
export function cardFor(id: WidgetId, d: DashData): CardView | null {
  const short = periodOf(d.period).short;
  switch (id) {
    case 'trend':
      return {
        kind: 'card', title: 'Total profit', action: muted(short),
        body: <ProfitChart points={profitSeries(d.deliveries, d.costs, d.period, TODAY)} total={d.now.profit} delta={deltaOf(d.now.profit, d.before.profit, d) ?? null} previousLabel={periodOf(d.period).previous} />,
      };
    case 'ontime': {
      const points = Math.round((onTimeRate(d.now) - onTimeRate(d.before)) * 100);
      const delta = d.now.timed && d.before.timed
        ? { text: `${points >= 0 ? '▲' : '▼'} ${Math.abs(points)} pts vs ${periodOf(d.period).previous}`, title: `${points >= 0 ? 'Up' : 'Down'} ${Math.abs(points)} percentage points`, good: points >= 0 }
        : null;
      return {
        kind: 'card', title: 'On-time delivery', action: muted(short),
        body: <OnTimeGauge key={d.period} rate={onTimeRate(d.now)} onTime={d.now.onTime} timed={d.now.timed} target={ON_TIME_TARGET} delta={delta} late={d.now.late} short={short} />,
      };
    }
    case 'lanes': {
      const rows = lanesByProfit(d.deliveries, d.range).slice(0, 6);
      return {
        kind: 'card', title: 'Top lanes by profit', action: muted(short),
        body: (
          <HBars
            empty="No deliveries in this period."
            rows={rows.map((r) => ({ key: r.lane, value: r.profit, label: usd0(r.profit), meta: `${r.loads} load${r.loads === 1 ? '' : 's'}${r.miles ? ` · ${perMile(r.revenue / r.miles)}/mi` : ''}` }))}
          />
        ),
      };
    }
    case 'ontime-customers':
      return { kind: 'card', title: 'On-time by customer', flush: true, action: muted(short), body: <OnTimeByCustomer d={d} /> };
    case 'late-loads':
      return { kind: 'card', title: 'Late deliveries', action: <Link className="ui-link" to="/app/loads">Loads →</Link>, body: <LateLoads d={d} /> };
    default:
      return null;
  }
}

// Notifications (release 1.33): the bell in the top bar. Urgent alerts (a
// breakdown on a load, a delayed load, a pickup with no driver, an expired
// licence on a load — data/alerts.ts) are pinned to the top; below them,
// what has happened recently, newest first: load activity, payments
// received, invoices falling past due, and driver documents running out.
import { urgentAlerts } from './alerts';
import { driverDocuments } from './compliance';
import type { FleetDriver } from './fleet';
import { invoiceTotal, usd0, type InvoiceRecord } from './invoicing';
import type { Load } from './mock';
import type { WorkOrder } from './safetyRecords';
import { addDaysIso } from '../lib/isoDates';

export interface Notice {
  key: string;
  text: string;
  to: string;
  urgent: boolean;
  // When it happened: a date-time, or a date for whole-day events ('' for urgent alerts, which are about now).
  at: string;
  kind: 'alert' | 'load' | 'payment' | 'overdue' | 'document';
}

// How far back the feed reaches.
export const NOTICE_DAYS = 14;
const MAX = 40;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export interface NoticeSources {
  loads: Load[];
  invoices: InvoiceRecord[];
  drivers: FleetDriver[];
  workOrders: WorkOrder[];
  today: string;
  // What this account may open (each notice only shows if its page is allowed).
  may: { loads: boolean; accounting: boolean; documents: boolean };
}

export function notifications({ loads, invoices, drivers, workOrders, today, may }: NoticeSources): Notice[] {
  const since = addDaysIso(today, -NOTICE_DAYS);
  const urgent: Notice[] = may.loads
    ? urgentAlerts(loads, workOrders, drivers, today).map((a) => ({ key: a.key, text: a.text, to: a.to, urgent: true, at: '', kind: 'alert' as const }))
    : [];
  const recent: Notice[] = [];

  if (may.loads) {
    for (const l of loads) {
      for (const [i, h] of (l.history ?? []).entries()) {
        if (!h.at || h.at.slice(0, 10) < since) continue;
        const what = h.what.replace(/^Status: .* → /, 'Moved to ');
        recent.push({ key: `load:${l.id}:${i}`, text: `${l.id} · ${what}${h.by ? ` · ${h.by}` : ''}`, to: `/app/loads/${l.id}`, urgent: false, at: h.at, kind: 'load' });
      }
    }
  }

  if (may.accounting) {
    for (const inv of invoices) {
      if (inv.paid?.date && inv.paid.date >= since && inv.paid.date <= today) {
        recent.push({ key: `paid:${inv.id}`, text: `Payment received · ${inv.id} · ${inv.customer} · ${usd0(invoiceTotal(inv))}`, to: '/app/accounting/paid', urgent: false, at: inv.paid.date, kind: 'payment' });
      }
      const overdueFrom = inv.due ? addDaysIso(inv.due, 1) : '';
      if (!inv.paid && !inv.draft && overdueFrom && overdueFrom >= since && overdueFrom <= today) {
        recent.push({ key: `overdue:${inv.id}`, text: `${inv.id} is past due · ${inv.customer} · ${usd0(invoiceTotal(inv))}`, to: '/app/accounting/past-due', urgent: false, at: overdueFrom, kind: 'overdue' });
      }
    }
  }

  if (may.documents) {
    for (const d of driverDocuments(drivers)) {
      if (!d.date) continue;
      // Expired: on the day it ran out. Running out: 30 days before (or today, if that has passed).
      if (d.status === 'Expired' && d.date >= since) {
        recent.push({ key: `doc:${d.driverId}:${d.document}`, text: `${d.driver}’s ${d.document} expired on ${short(d.date)}`, to: '/app/safety/driver-documents', urgent: false, at: d.date, kind: 'document' });
      } else if (d.status === 'Expiring') {
        const notice = addDaysIso(d.date, -30);
        recent.push({ key: `doc:${d.driverId}:${d.document}`, text: `${d.driver}’s ${d.document} expires on ${short(d.date)}`, to: '/app/safety/driver-documents', urgent: false, at: notice > today ? today : notice < since ? since : notice, kind: 'document' });
      }
    }
  }

  recent.sort((a, b) => b.at.localeCompare(a.at));
  return [...urgent, ...recent.slice(0, MAX)];
}

// Whether a notice arrived after the bell was last opened (urgent ones always count).
export const isUnread = (n: Notice, lastSeen: string) => n.urgent || !lastSeen || n.at > lastSeen;

// '5 min ago', '3 h ago', 'Yesterday', 'Nov 3' — or 'Now' for an urgent alert.
export function noticeTime(n: Notice, now: Date, today: string): string {
  if (n.urgent) return 'Now';
  if (n.at.length > 10) {
    const mins = Math.round((now.getTime() - new Date(n.at).getTime()) / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 24 * 60 && n.at.slice(0, 10) === today) return `${Math.round(mins / 60)} h ago`;
  }
  const day = n.at.slice(0, 10);
  if (day === today) return 'Today';
  if (day === addDaysIso(today, -1)) return 'Yesterday';
  return short(day);
}

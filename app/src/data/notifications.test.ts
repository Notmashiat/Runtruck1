import { describe, expect, it } from 'vitest';
import type { InvoiceRecord } from './invoicing';
import type { Load } from './mock';
import { isUnread, noticeTime, notifications } from './notifications';

const TODAY = '2026-11-12';
const load = (id: string, patch: Partial<Load>): Load => ({
  id, customer: 'Northgate Foods', route: 'Fresno, CA → Reno, NV', pickup: '', delivery: '', driver: 'Marcus Hale', unit: 'T-114', rate: '$2,450',
  status: 'In transit', tagClass: '', miles: '478', rpm: '', pay: '', margin: '', commodity: '', weight: '', equip: '', temp: '', ref: '',
  from: '', fromAddr: '', to: '', toAddr: '', carrier: '', carrierMc: '', carrierDot: '', ...patch,
} as Load);
const invoice = (id: string, patch: Partial<InvoiceRecord>): InvoiceRecord => ({
  id, draft: false, customer: 'Bayline Distribution', loads: [], ref: '', bol: '', route: '', pickup: '', delivery: '', equipment: '', commodity: '', weight: '', miles: '',
  billTo: { name: '', attn: '', street: '', city: '', state: '', zip: '', email: '', phone: '' },
  issued: '2026-10-01', terms: 'Net 30', due: '2026-10-31', lines: [{ kind: 'Line haul', description: '', qty: '1', rate: '1000' }],
  memo: '', internal: '', history: [], created: '', ...patch,
});
const may = { loads: true, accounting: true, documents: true };

describe('Notifications', () => {
  const loads = [
    load('L-1', { status: 'Delayed' }),
    load('L-2', { history: [{ at: '2026-11-11T09:00:00.000Z', by: 'Rosa', what: 'Status: Booked → Dispatched' }, { at: '2026-11-12T08:00:00.000Z', by: 'Rosa', what: 'Bill of lading attached (bol.pdf)' }] }),
  ];
  const invoices = [invoice('INV-1', { paid: { date: '2026-11-10', via: 'ACH', reference: '' } }), invoice('INV-2', { due: '2026-11-05' })];
  const list = notifications({ loads, invoices, drivers: [], workOrders: [], today: TODAY, may });

  it('pins urgent alerts to the top, then the rest newest first', () => {
    expect(list.map((n) => n.key)).toEqual(['late:L-1', 'load:L-2:1', 'load:L-2:0', 'paid:INV-1', 'overdue:INV-2']);
    expect(list[0].urgent).toBe(true);
    expect(list[2].text).toBe('L-2 · Moved to Dispatched · Rosa');
  });

  it('leaves out what the account may not open', () => {
    const loadsOnly = notifications({ loads, invoices, drivers: [], workOrders: [], today: TODAY, may: { loads: true, accounting: false, documents: false } });
    expect(loadsOnly.some((n) => n.kind === 'payment' || n.kind === 'overdue')).toBe(false);
  });

  it('counts what came in since the bell was opened, and urgent alerts always', () => {
    const seen = '2026-11-11T12:00:00.000Z';
    expect(list.filter((n) => isUnread(n, seen)).map((n) => n.key)).toEqual(['late:L-1', 'load:L-2:1']);
  });

  it('says when, in words', () => {
    const now = new Date('2026-11-12T08:30:00.000Z');
    expect(noticeTime(list[1], now, TODAY)).toBe('30 min ago');
    expect(noticeTime(list[3], now, TODAY)).toBe('Nov 10');
    expect(noticeTime(list[0], now, TODAY)).toBe('Now');
  });
});

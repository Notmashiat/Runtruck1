import { describe, expect, it } from 'vitest';
import type { InvoiceRecord } from '../data/invoicing';
import { invoiceRules, requiredCount } from './invoiceRules';

const blank: InvoiceRecord = {
  id: 'INV-1', draft: true, customer: '', loads: [], ref: '', bol: '', route: '', pickup: '', delivery: '', equipment: '', commodity: '', weight: '', miles: '',
  billTo: { name: '', attn: '', street: '', city: '', state: '', zip: '', email: '', phone: '' },
  issued: '2026-11-10', terms: 'Net 30', due: '2026-12-10', lines: [], memo: '', internal: '', history: [], created: '2026-11-10T00:00:00.000Z',
};
const ready = (patch: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  ...blank, customer: 'Northgate Foods',
  billTo: { ...blank.billTo, name: 'Northgate Foods', street: '1200 N Blackstone Ave', city: 'Fresno', state: 'CA' },
  lines: [{ kind: 'Line haul', description: 'L-40209', qty: '1', rate: '2188' }],
  ...patch,
});
const messages = (d: InvoiceRecord, customerPicked = true) => Object.fromEntries(invoiceRules(d, { customerPicked }).map((r) => [r.field, r.m]));

describe('New Invoice checks', () => {
  it('asks for what a blank invoice is missing', () => {
    expect(messages(blank, false)).toEqual({
      customer: 'Search and select the customer to bill.',
      'bill-name': 'Enter who the invoice is billed to.',
      'bill-street': 'Enter the billing street address.',
      'bill-city': 'Enter the billing city.',
      'bill-state': 'Enter the 2-letter state.',
      'btn-add-line': 'Add at least one charge.',
    });
  });

  it('a filled-in invoice passes', () => {
    expect(invoiceRules(ready(), { customerPicked: true })).toEqual([]);
  });

  it('a typed customer name that was not picked is not accepted', () => {
    expect(messages(ready(), false).customer).toBe('Pick the customer from the list.');
  });

  it('checks dates, the email, each charge and the total', () => {
    const m = messages(ready({
      due: '2026-11-01',
      billTo: { ...ready().billTo, email: 'ap@' },
      lines: [{ kind: '', description: '', qty: '0', rate: 'x' }, { kind: 'Discount', description: '', qty: '1', rate: '-50' }],
    }));
    expect(m.due).toBe('The due date can’t be before the invoice date.');
    expect(m['bill-email']).toBe('Enter a valid email, e.g. ap@company.com.');
    expect(m['line-0-kind']).toBe('Pick the charge type.');
    expect(m['line-0-qty']).toBe('Enter a quantity above 0.');
    expect(m['line-0-rate']).toBe('Enter the rate, e.g. 150.00.');
    expect(m['btn-add-line']).toBe('The total must be more than $0.');
  });

  it('counts the required details per section for the menu', () => {
    expect(requiredCount(blank, 'billto')).toBe(4);
    expect(requiredCount(ready({ billTo: { ...ready().billTo, email: 'ap@x.com' } }), 'billto')).toBe(5);
    expect(requiredCount(ready(), 'charges')).toBe(4);
    expect(requiredCount(blank, 'charges')).toBe(1);
  });
});

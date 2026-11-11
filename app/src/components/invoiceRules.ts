import { invoiceTotal, type InvoiceRecord } from '../data/invoicing';

// What the New Invoice popup checks before an invoice is created, one rule
// per problem, with the message shown under its field. `field` is the input
// the message belongs to (its id is 'nl-' + field).

export type InvSection = 'customer' | 'billto' | 'details' | 'shipment' | 'charges' | 'notes' | 'preview';
export interface InvRule { id: string; section: InvSection; field: string; m: string }

// The sections with required details (the progress bar counts these).
export const INV_COUNTED: InvSection[] = ['customer', 'billto', 'details', 'charges'];

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function invoiceRules(d: InvoiceRecord, { customerPicked }: { customerPicked: boolean }): InvRule[] {
  const out: InvRule[] = [];
  const add = (id: string, section: InvSection, m: string, field = id) => out.push({ id, section, field, m });

  if (!customerPicked) add('customer', 'customer', d.customer ? 'Pick the customer from the list.' : 'Search and select the customer to bill.');

  const b = d.billTo;
  if (!b.name.trim()) add('bill-name', 'billto', 'Enter who the invoice is billed to.');
  if (!b.street.trim()) add('bill-street', 'billto', 'Enter the billing street address.');
  if (!b.city.trim()) add('bill-city', 'billto', 'Enter the billing city.');
  if (!/^[A-Za-z]{2}$/.test(b.state.trim())) add('bill-state', 'billto', 'Enter the 2-letter state.');
  if (b.email.trim() && !isEmail(b.email)) add('bill-email', 'billto', 'Enter a valid email, e.g. ap@company.com.');

  if (!d.issued) add('issued', 'details', 'Pick the invoice date.');
  if (!d.due) add('due', 'details', 'Pick the due date.');
  else if (d.issued && d.due < d.issued) add('due', 'details', 'The due date can’t be before the invoice date.');

  if (!d.lines.length) add('lines', 'charges', 'Add at least one charge.', 'btn-add-line');
  d.lines.forEach((l, i) => {
    if (!l.kind) add(`line-${i}-kind`, 'charges', 'Pick the charge type.');
    if (!(Number(l.qty) > 0)) add(`line-${i}-qty`, 'charges', 'Enter a quantity above 0.');
    if (l.rate.trim() === '' || Number.isNaN(Number(l.rate))) add(`line-${i}-rate`, 'charges', 'Enter the rate, e.g. 150.00.');
  });
  if (d.lines.length && invoiceTotal(d) <= 0) add('total', 'charges', 'The total must be more than $0.', 'btn-add-line');
  return out;
}

// How many required details each counted section has, for "3/4" in the menu.
export function requiredCount(d: InvoiceRecord, section: InvSection): number {
  if (section === 'customer') return 1;
  if (section === 'billto') return 4 + (d.billTo.email.trim() ? 1 : 0);
  if (section === 'details') return 2;
  if (section === 'charges') return d.lines.length ? d.lines.length * 3 + 1 : 1;
  return 0;
}

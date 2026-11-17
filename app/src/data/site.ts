// What the public marketing page (pages/marketing) says. Everything here is
// checked against what RunTruck really does: a claim that the product cannot
// back up does not belong on this page.
import { PLANS, TRIAL_DAYS } from './companies';

// Where "Start trial" and "Talk to us" send people: an email address RunTruck
// reads. While it is empty those buttons lead to the "Get started" section
// instead of opening an email.
export const CONTACT_EMAIL = '';

export const contactHref = (subject: string, body = ''): string =>
  CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`
    : '#start';

export const TRIAL = `${TRIAL_DAYS}-day free trial`;

// — the scroll scene: one load, from booked to paid —

export interface JourneyStep {
  key: string;
  // When, as a share of the scene, this step takes over.
  from: number;
  status: string;
  chip: 'gray' | 'blue' | 'amber' | 'green';
  title: string;
  body: string;
}

export const JOURNEY: JourneyStep[] = [
  {
    key: 'booked', from: 0, status: 'Booked', chip: 'gray',
    title: 'A load comes in. Enter it once.',
    body: 'Customer, every stop with its appointment window, line haul, fuel surcharge and accessorials. That one record is what dispatch, billing and payroll all work from.',
  },
  {
    key: 'dispatched', from: 0.14, status: 'Dispatched', chip: 'blue',
    title: 'Put a driver and a truck on it.',
    body: 'Assign the driver, tractor and trailer, or cover it with a partner carrier. The planner shows every truck’s week, with its loads and empty time.',
  },
  {
    key: 'transit', from: 0.3, status: 'In transit', chip: 'blue',
    title: 'Everyone sees where it stands.',
    body: 'Update the status from the load’s page and send the driver the stops, times and reference as a text or an email. Every change is kept in the load’s history.',
  },
  {
    key: 'delivered', from: 0.5, status: 'Delivered', chip: 'amber',
    title: 'Delivered, with the paperwork on the load.',
    body: 'Attach the signed proof of delivery to the load. The delivery day is recorded, and that is the day invoicing and driver pay go by.',
  },
  {
    key: 'invoiced', from: 0.68, status: 'Invoiced', chip: 'blue',
    title: 'Invoice it without retyping anything.',
    body: 'The invoice is built from the load: line haul, fuel surcharge and accessorials. Send the PDF on your letterhead, or batch it for your factoring company.',
  },
  {
    key: 'paid', from: 0.85, status: 'Paid', chip: 'green',
    title: 'Get paid. Pay the driver.',
    body: 'Record the payment and the load counts toward the driver’s pay run: by mile, percentage, flat rate, hourly or salary, with a statement for every driver.',
  },
];

// The step a share of the scene falls in.
export const stepAt = (p: number): number => {
  let at = 0;
  JOURNEY.forEach((s, i) => {
    if (p >= s.from) at = i;
  });
  return at;
};

// — what is in the product —

export const FEATURES: { title: string; body: string }[] = [
  { title: 'Loads & dispatch', body: 'Multi-stop loads with appointment windows, rates and charges. Status, documents and a full history on every load.' },
  { title: 'Planner', body: 'Every truck across the week: its loads, deadhead and empty time. Connect a nearby load, or drag a load to another truck.' },
  { title: 'Fleet', body: 'Drivers, trucks and trailers with the dates that matter: CDL and medical card, plates, odometer and next service.' },
  { title: 'Customers & facilities', body: 'Customers with terms, credit limits and documents. Shipper and receiver sites with hours, dock rules and detention risk.' },
  { title: 'Invoicing', body: 'Invoices built from delivered loads, PDFs on your letterhead, batches for factoring, past-due reminders and late fees.' },
  { title: 'Bills', body: 'Fuel, insurance, repairs and recurring bills with due dates, scheduled payments and the receipts attached.' },
  { title: 'Payroll & settlements', body: 'Pay by mile, percentage of line haul, flat per load, hourly or salary. Deductions, held pay and a PDF statement for each person.' },
  { title: 'HR', body: 'Employment contracts with terms, signatures and renewals, and an onboarding checklist for every new hire.' },
  { title: 'Safety & compliance', body: 'Maintenance work orders, driver qualification files, inspections and violations, and claims with their deadlines.' },
];

export const ALSO = ['A dashboard you arrange yourself', 'Exports to PDF, Excel, Word and CSV', 'A login and permissions for each person', 'Light and dark mode'];

export const AUDIENCES: { name: string; body: string }[] = [
  { name: 'Motor carriers', body: 'Run dispatch, the fleet, billing, driver pay and safety from one place instead of five spreadsheets.' },
  { name: 'Owner-operators', body: 'Keep loads, invoices, bills and your own compliance dates together, without paying for seats you do not need.' },
  { name: 'Brokers', body: 'Cover loads with partner carriers, keep what you bill and what you pay the carrier on the same load.' },
  { name: 'Private fleets', body: 'Plan deliveries, track maintenance and keep driver files current for the trucks that haul your own product.' },
];

export const FACTS: { value: string; label: string }[] = [
  { value: '1', label: 'record per load, from booking to payment' },
  { value: String(TRIAL_DAYS), label: 'days free, on your own freight' },
  { value: '$0', label: 'per extra user: pricing is per truck' },
  { value: '4', label: 'export formats: PDF, Excel, Word, CSV' },
];

// — pricing: the same figures RunTruck bills by (data/companies.ts) —

export const PRICING = [
  { name: 'Starter', fits: PLANS.Starter.fits, price: `$${PLANS.Starter.perTruck}`, unit: 'per truck / month', note: `A 10-truck fleet pays $${(PLANS.Starter.perTruck ?? 0) * 10} a month.`, cta: `Start ${TRIAL}`, featured: false },
  { name: 'Growth', fits: PLANS.Growth.fits, price: `$${PLANS.Growth.perTruck}`, unit: 'per truck / month', note: `A 40-truck fleet pays $${((PLANS.Growth.perTruck ?? 0) * 40).toLocaleString('en-US')} a month.`, cta: `Start ${TRIAL}`, featured: true },
  { name: 'Enterprise', fits: '100+ trucks', price: 'Custom', unit: 'priced for your fleet', note: 'One price agreed for the whole fleet.', cta: 'Talk to us', featured: false },
];

export const INCLUDED = ['Every feature, on every plan', 'Unlimited users, trailers, customers and documents', 'Monthly or annual billing', 'Your data exports any time'];

export const FAQS: { q: string; a: string }[] = [
  { q: 'What does RunTruck replace?', a: 'The load spreadsheet, the dispatch whiteboard, the invoice template, the settlement workbook and the compliance binder. One record per load feeds all of them, so nothing is typed twice.' },
  { q: 'How is it priced?', a: 'Per truck, per month. Users, trailers, customers and documents are not counted, and every plan has every feature.' },
  { q: 'Is there a free trial?', a: `Yes, ${TRIAL_DAYS} days. Nothing is deleted when it ends: the account is paused until you subscribe.` },
  { q: 'Do my drivers need an app?', a: 'No. Dispatch sends a driver the stops, times and reference as a text or an email straight from the load.' },
  { q: 'Does it connect to my accounting software or ELD?', a: 'Not directly yet. Invoices, bills and pay runs export to Excel and CSV, which accounting software can import.' },
  { q: 'Can I get my data out?', a: 'Any time. Every list exports to PDF, Excel, Word or CSV, and Settings can download a full backup of your records.' },
  { q: 'Who can see what?', a: 'Each person has their own login and sees only the sections you give them: dispatch, accounting, payroll, safety and so on.' },
];

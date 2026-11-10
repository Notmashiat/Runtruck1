import type { Draft, StopDraft } from './loadForm';

// What New Load checks before a load is created (design: Loadpopupv_2), and
// the lists built from it: each section's status, the progress bar and the
// Required details checklist. Field keys are the inputs' ids without 'nl-'.

export type SectionId = 'document' | 'load' | 'pickup' | 'delivery' | 'freight' | 'rate' | 'ltl' | 'truck' | 'notes';

export interface RuleResult {
  m: string;
  // The inputs to mark; all of the rule's inputs when absent.
  bad?: string[];
}

export interface Rule {
  id: string;
  section: SectionId;
  inputs: string[];
  result: RuleResult | null;
}

export interface Check {
  label: string;
  rules: string[];
}

export interface RuleContext {
  customerPicked: boolean;
}

const E = (m: string, bad?: string[]): RuleResult => ({ m, bad });
const joinList = (a: string[]) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const amount = (s: string) => parseFloat(s.replace(/[^\d.-]/g, '')) || 0;

// 'Thu, Jul 25'
export function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export const isPickup = (s: StopDraft) => s.kind === 'Pickup';
export const schedOf = (s: StopDraft) => s.sched ?? 'fcfs';

function stopRules(d: Draft, i: number): Rule[] {
  const s = d.stops[i];
  const p = `s${i}`;
  const section: SectionId = isPickup(s) ? 'pickup' : 'delivery';
  const n = isPickup(s) ? 'pickup' : 'delivery';
  const csz = () => {
    const bad: string[] = [];
    const m: string[] = [];
    if (!s.city.trim()) { bad.push(`${p}-city`); m.push('city'); }
    if (!/^[A-Za-z]{2}$/.test(s.state.trim())) { bad.push(`${p}-state`); m.push('2-letter state'); }
    if (!/^\d{5}$/.test(s.zip.trim())) { bad.push(`${p}-zip`); m.push('5-digit ZIP'); }
    return bad.length ? E(`Enter a ${joinList(m)}.`, bad) : null;
  };
  // A delivery can't be before the last pickup.
  const lastPickup = d.stops.filter((x) => isPickup(x) && x.date).map((x) => x.date).sort().pop() ?? '';
  const date = () => {
    if (!s.date) return E('Choose a date.');
    if (!isPickup(s) && lastPickup && s.date < lastPickup) return E(`Can't be before pickup (${fmtDay(lastPickup)}).`);
    return null;
  };
  const fcfs = schedOf(s) === 'fcfs';
  const time = () => {
    if (fcfs) {
      const a = s.from.trim();
      const b = s.to.trim();
      if (!a || !b) return E('Enter when the window opens and closes.', [!a && `${p}-from`, !b && `${p}-to`].filter(Boolean) as string[]);
      if (b <= a) return E('The window must close after it opens.', [`${p}-to`]);
      return null;
    }
    return s.appt?.trim() ? null : E('Enter the appointment time.');
  };
  return [
    { id: `${p}-facility`, section, inputs: [`${p}-facility`], result: s.facility.trim() ? null : E(`Enter the ${n} facility name.`) },
    { id: `${p}-street`, section, inputs: [`${p}-street`], result: s.address.trim() ? null : E('Enter the street address.') },
    { id: `${p}-csz`, section, inputs: [`${p}-city`, `${p}-state`, `${p}-zip`], result: csz() },
    { id: `${p}-date`, section, inputs: [`${p}-date`], result: date() },
    { id: `${p}-time`, section, inputs: fcfs ? [`${p}-from`, `${p}-to`] : [`${p}-appt`], result: time() },
  ];
}

// Every rule that applies to the entry as it is now (a rule that does not
// apply, like hazmat's with hazmat off, is left out).
export function rulesFor(d: Draft, ctx: RuleContext): Rule[] {
  const rules: Rule[] = [
    {
      id: 'customer', section: 'load', inputs: ['customer-search'],
      result: ctx.customerPicked ? null : E(d.customer.trim() ? 'Pick a customer from the list — typed names are not saved.' : 'Search and select the broker or customer.'),
    },
    { id: 'tender', section: 'load', inputs: ['f-tender'], result: d.ref.trim() ? null : E('Enter the tender number from the rate confirmation.') },
    ...d.stops.flatMap((_, i) => stopRules(d, i)),
    { id: 'commodity', section: 'freight', inputs: ['f-commodity'], result: d.commodity.trim() ? null : E('Describe the commodity, e.g. "Packaged chemicals".') },
    { id: 'weight', section: 'freight', inputs: ['f-weight'], result: amount(d.weight) > 0 ? null : E('Enter the weight in pounds.') },
  ];
  if (d.tempOn) {
    rules.push({
      id: 'temp', section: 'freight', inputs: ['f-temp'],
      result: d.temp.trim() !== '' && !Number.isNaN(Number(d.temp.trim())) ? null : E('Enter the setpoint in °F, e.g. 34 or -10.'),
    });
  }
  if (d.hazmat) {
    rules.push(
      { id: 'un', section: 'freight', inputs: ['f-un'], result: /^\d{4}$/.test(d.unNumber.trim()) ? null : E('Enter the 4-digit UN number.') },
      { id: 'hzclass', section: 'freight', inputs: ['f-hzclass'], result: d.hzClass ? null : E('Select a hazard class.') },
    );
  }
  rules.push(
    { id: 'equipment', section: 'freight', inputs: ['f-equipment'], result: d.equipment ? null : E('Select the equipment type.') },
    { id: 'linehaul', section: 'rate', inputs: ['f-linehaul'], result: amount(d.lineHaul) > 0 ? null : E('Enter the linehaul rate.') },
  );
  if (d.mode === 'Partial') {
    rules.push({ id: 'ltl-link', section: 'ltl', inputs: ['ltl-search'], result: d.ltlLoad ? null : E('Search and select the LTL load this partial connects to.') });
  }
  return rules;
}

// The Required details checklist, in the design's order.
export function checksFor(d: Draft, rules: Rule[]): Check[] {
  const ids = (pred: (r: Rule) => boolean) => rules.filter(pred).map((r) => r.id);
  const stopIds = (kind: 'pickup' | 'delivery', parts: string[]) =>
    ids((r) => r.section === kind && parts.some((x) => r.id.endsWith(`-${x}`)));
  const list: Check[] = [
    { label: 'Customer', rules: ['customer'] },
    { label: 'Tender number', rules: ['tender'] },
    { label: 'Pickup location', rules: stopIds('pickup', ['facility', 'street', 'csz']) },
    { label: 'Pickup date & time', rules: stopIds('pickup', ['date', 'time']) },
    { label: 'Delivery location', rules: stopIds('delivery', ['facility', 'street', 'csz']) },
    { label: 'Delivery date & time', rules: stopIds('delivery', ['date', 'time']) },
    { label: 'Commodity & weight', rules: ['commodity', 'weight'] },
  ];
  if (d.tempOn) list.push({ label: 'Temperature setpoint', rules: ['temp'] });
  if (d.hazmat) list.push({ label: 'Hazmat UN # & class', rules: ['un', 'hzclass'] });
  list.push({ label: 'Equipment type', rules: ['equipment'] }, { label: 'Linehaul rate', rules: ['linehaul'] });
  if (d.mode === 'Partial') list.push({ label: 'Connected LTL load', rules: ['ltl-link'] });
  return list;
}

// The sections that count toward progress (the others are optional).
export const COUNTED: SectionId[] = ['load', 'pickup', 'delivery', 'freight', 'rate', 'ltl'];

// A rule-free problem with an extra row (a document without a category, a
// charge without a type or amount), checked when the load is created.
export function chargeProblem(type: string, value: string): { field: 'type' | 'amount'; m: string } | null {
  if (!type.trim()) return { field: 'type', m: 'Choose a charge type, or remove this charge.' };
  if (!(amount(value) > 0)) return { field: 'amount', m: 'Enter the charge amount.' };
  return null;
}

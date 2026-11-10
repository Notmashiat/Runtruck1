import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BillDocument } from '../data/bills';
import { e164, sendText } from '../lib/sms';
import { INITIAL, emptyStop, toLoad, type Draft, type StopDraft } from './loadForm';
import { checksFor, rulesFor } from './newLoadRules';
import { POST } from '../../api/sms';

const stop = (kind: StopDraft['kind'], patch: Partial<StopDraft> = {}): StopDraft => ({ ...emptyStop(kind), sched: 'fcfs', ...patch });
const doc = (name: string): BillDocument => ({ id: `DOC-${name}`, name, type: 'application/pdf', size: 1000, stored: true, added: '2026-07-20T00:00:00.000Z' });

// A load filled in the way the popup leaves it, ready to save.
function filled(patch: Partial<Draft> = {}): Draft {
  return {
    ...INITIAL,
    customer: 'Northgate Foods', customerId: 'CUS-1', ref: '1098219',
    stops: [
      stop('Pickup', { facility: 'Bonded Logistics', address: '1701 Westinghouse Blvd', city: 'Charlotte', state: 'NC', zip: '28273', date: '2026-07-25', from: '12:00', to: '16:00' }),
      stop('Delivery', { facility: 'Sonoco', address: '1950 Pratt Blvd', city: 'Elk Grove Village', state: 'IL', zip: '60007', date: '2026-07-27', sched: 'appt', appt: '08:30' }),
    ],
    commodity: 'Packaged chemicals', weight: '20000', equipment: 'Dry Van', trailerLength: '53 ft', lineHaul: '3000', fuel: '250',
    ...patch,
  };
}

describe('New Load rules', () => {
  it('asks for what a blank load is missing, with the design’s messages', () => {
    const d: Draft = { ...INITIAL, stops: [stop('Pickup'), stop('Delivery')] };
    const missing = new Map(rulesFor(d, { customerPicked: false }).filter((r) => r.result).map((r) => [r.id, r.result?.m]));
    expect(missing.get('customer')).toBe('Search and select the broker or customer.');
    expect(missing.get('tender')).toBe('Enter the tender number from the rate confirmation.');
    expect(missing.get('s0-facility')).toBe('Enter the pickup facility name.');
    expect(missing.get('s1-facility')).toBe('Enter the delivery facility name.');
    expect(missing.get('s0-csz')).toBe('Enter a city, 2-letter state and 5-digit ZIP.');
    expect(missing.get('s0-time')).toBe('Enter when the window opens and closes.');
    expect(missing.get('linehaul')).toBe('Enter the linehaul rate.');
    // Hazmat, temperature and the LTL link only count when they are switched on.
    expect(missing.has('un')).toBe(false);
    expect(missing.has('temp')).toBe(false);
    expect(missing.has('ltl-link')).toBe(false);
  });

  it('a typed customer name that was not picked is not accepted', () => {
    const r = rulesFor(filled({ customerId: '' }), { customerPicked: false }).find((x) => x.id === 'customer');
    expect(r?.result?.m).toBe('Pick a customer from the list — typed names are not saved.');
  });

  it('checks windows, dates and the switched-on sections', () => {
    const d = filled({
      tempOn: true, temp: '', hazmat: true, unNumber: '12', mode: 'Partial',
      stops: [
        stop('Pickup', { facility: 'A', address: '1 Main', city: 'Reno', state: 'NV', zip: '89501', date: '2026-07-25', from: '16:00', to: '12:00' }),
        stop('Delivery', { facility: 'B', address: '2 Main', city: 'Boise', state: 'ID', zip: '83702', date: '2026-07-24', from: '08:00', to: '10:00' }),
      ],
    });
    const missing = new Map(rulesFor(d, { customerPicked: true }).filter((r) => r.result).map((r) => [r.id, r.result?.m]));
    expect(missing.get('s0-time')).toBe('The window must close after it opens.');
    expect(missing.get('s1-date')).toMatch(/^Can't be before pickup \(.+\)\.$/);
    expect(missing.get('temp')).toBe('Enter the setpoint in °F, e.g. 34 or -10.');
    expect(missing.get('un')).toBe('Enter the 4-digit UN number.');
    expect(missing.get('hzclass')).toBe('Select a hazard class.');
    expect(missing.get('ltl-link')).toBe('Search and select the LTL load this partial connects to.');
  });

  it('a filled-in load passes, and the checklist covers every required detail', () => {
    const d = filled();
    const rules = rulesFor(d, { customerPicked: true });
    expect(rules.filter((r) => r.result)).toEqual([]);
    expect(checksFor(d, rules).map((c) => c.label)).toEqual([
      'Customer', 'Tender number', 'Pickup location', 'Pickup date & time', 'Delivery location', 'Delivery date & time',
      'Commodity & weight', 'Equipment type', 'Linehaul rate',
    ]);
  });
});

describe('Saving a load from the new popup', () => {
  it('keeps the new fields on the load', () => {
    const l = toLoad(filled({
      tempOn: true, temp: '34', reeferMode: 'Cycle', equipment: 'Reefer',
      charges: [{ type: 'Detention', amount: '150.00' }, { type: 'Lumper', amount: '1,200.50' }],
      brokered: true, carrier: 'Sultan Trans Inc', carrierMc: '811111',
      directions: 'Gate 3 off Pratt Blvd',
      docList: [{ category: 'BOL', doc: doc('bol1.pdf') }, { category: 'BOL', doc: doc('bol2.pdf') }, { category: 'Scale ticket', doc: doc('scale.jpg') }],
    }), 'L-50001', undefined, ['Load summary texted to Ana Cortez']);
    expect(l.equip).toBe('Reefer, 53 ft');
    expect(l.temp).toBe('34 °F · cycle');
    expect(l.charges).toEqual({ lineHaul: 3000, fuel: 250, accessorials: 1350.5 });
    expect(l.ref).toBe('1098219');
    expect(l.carrier).toBe('Sultan Trans Inc');
    expect(l.carrierMc).toBe('MC 811111');
    expect(l.stops?.[1].when).toMatch(/· Appt 08:30$/);
    expect(l.notes).toBe('Directions: Gate 3 off Pratt Blvd');
    const docs = Object.fromEntries((l.documents ?? []).filter((x) => x.file).map((x) => [x.name, x.file]));
    expect(docs).toEqual({ 'Bill of lading': 'bol1.pdf', 'Bill of lading (2)': 'bol2.pdf', 'Scale ticket': 'scale.jpg' });
    expect(l.history?.map((h) => h.what)).toEqual(['Load created', 'Load summary texted to Ana Cortez']);
  });

  it('a partial records the LTL load it rides with', () => {
    const l = toLoad(filled({ mode: 'Partial', ltlLoad: 'L-40300' }), 'L-50002');
    expect(l.mode).toBe('Partial');
    expect(l.ltl).toBe('Rides with LTL load L-40300');
  });
});

describe('Texting drivers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes phone numbers the way Twilio needs them', () => {
    expect(e164('(209) 555-0147')).toBe('+12095550147');
    expect(e164('1 209 555 0147')).toBe('+12095550147');
    expect(e164('+44 20 7946 0958')).toBe('+442079460958');
    expect(e164('555-0147')).toBe('');
  });

  it('asks for a provider when none is connected', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await sendText('(209) 555-0147', 'Hi', { twilioSid: '', twilioToken: '', twilioFrom: '' })).toBe('Please connect to a provider.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the server function checks the request and passes it to Twilio', async () => {
    const sid = `AC${'a'.repeat(32)}`;
    const call = (body: unknown) => POST(new Request('http://x/api/sms', { method: 'POST', body: JSON.stringify(body) }));
    expect((await call({ sid: 'bad', token: 't', from: '+12095550100', to: '+12095550147', body: 'Hi' })).status).toBe(400);
    expect((await call({ sid, token: 't', from: '+12095550100', to: '555', body: 'Hi' })).status).toBe(400);

    const twilio = vi.fn(async () => new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 }));
    vi.stubGlobal('fetch', twilio);
    const ok = await call({ sid, token: 'secret', from: '+12095550100', to: '+12095550147', body: 'Load L-1' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, id: 'SM123' });
    const [url, init] = twilio.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`);
    expect(String(init.body)).toBe('To=%2B12095550147&From=%2B12095550100&Body=Load+L-1');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa(`${sid}:secret`)}`);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const denied = await call({ sid, token: 'wrong', from: '+12095550100', to: '+12095550147', body: 'Hi' });
    expect(await denied.json()).toEqual({ ok: false, error: 'Twilio did not accept the Account SID and Auth Token.' });
  });
});

import { describe, expect, it } from 'vitest';
import { placesToday, sectionOf } from './lastPlace';

describe('sectionOf', () => {
  it('names the section of a page', () => {
    expect(sectionOf('/app/loads')).toBe('loads');
    expect(sectionOf('/app/fleet/trucks')).toBe('fleet');
    expect(sectionOf('/app/accounting/past-due')).toBe('accounting');
  });
  it('skips pages with nothing to come back to', () => {
    expect(sectionOf('/app/loads/LD-1042')).toBe('');
    expect(sectionOf('/app/dashboard')).toBe('');
    expect(sectionOf('/app')).toBe('');
    expect(sectionOf('/pricing')).toBe('');
  });
});

describe('placesToday', () => {
  const saved = { day: '2026-11-12', who: '1:m1', places: { loads: '/app/loads?stage=delivered' } };
  it('keeps today’s places for the same person', () => expect(placesToday(saved, '2026-11-12', '1:m1')).toEqual(saved.places));
  it('starts over the next day', () => expect(placesToday(saved, '2026-11-13', '1:m1')).toEqual({}));
  it('is not shared with someone else', () => expect(placesToday(saved, '2026-11-12', '1:m2')).toEqual({}));
  it('ignores nothing saved', () => expect(placesToday(null, '2026-11-12', '1:m1')).toEqual({}));
});

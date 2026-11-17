import { describe, expect, it } from 'vitest';
import { locate, regionOf, roadMiles } from './geo';

describe('geo', () => {
  it('finds a city, or the middle of its state', () => {
    expect(locate('Fresno, CA')?.exact).toBe(true);
    expect(locate('1599 Maritime St, Oakland, CA 94607')?.exact).toBe(true);
    expect(locate('Smallville, KS')).toMatchObject({ exact: false, state: 'KS' });
    expect(locate('Somewhere')).toBeNull();
  });
  it('estimates road miles', () => {
    const m = roadMiles('Fresno, CA', 'Reno, NV') ?? 0;
    expect(m).toBeGreaterThan(220);
    expect(m).toBeLessThan(330);
    expect(roadMiles('Fresno, CA', 'Fresno, CA')).toBe(0);
    expect(roadMiles('Nowhere', 'Reno, NV')).toBeNull();
  });
  it('knows the region', () => {
    expect(regionOf('Atlanta, GA')).toBe('Southeast');
    expect(regionOf('Phoenix, AZ')).toBe('Southwest');
    expect(regionOf('Chicago, IL')).toBe('Midwest');
  });
});

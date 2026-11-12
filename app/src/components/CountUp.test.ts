import { describe, expect, it } from 'vitest';
import { scaleNumbers } from './CountUp';
import { smoothPath } from './DashboardCharts';

describe('scaleNumbers', () => {
  it('keeps the way a number is written', () => {
    expect(scaleNumbers('$28.1K', 0.5)).toBe('$14.1K');
    expect(scaleNumbers('$1,779', 1)).toBe('$1,779');
    expect(scaleNumbers('$1,779', 0)).toBe('$0');
    expect(scaleNumbers('−$59', 0.5)).toBe('−$30');
    expect(scaleNumbers('79%', 0.5)).toBe('40%');
  });
  it('leaves a total after a slash alone', () => expect(scaleNumbers('4/7', 0.5)).toBe('2/7'));
});

describe('smoothPath', () => {
  it('passes through every point', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 5 }]);
    expect(d.startsWith('M0.0,10.0')).toBe(true);
    expect(d).toContain(' 10.0,0.0');
    expect(d.endsWith(' 20.0,5.0')).toBe(true);
  });
  it('does not overshoot a peak', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }]);
    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });
  it('draws straight lines for two points', () => expect(smoothPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M0.0,0.0 L5.0,5.0'));
});

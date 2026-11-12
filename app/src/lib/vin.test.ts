import { describe, expect, it } from 'vitest';
import { readDecoded, tidyMake, vinProblem } from './vin';

describe('vinProblem', () => {
  it('accepts a 17-character VIN', () => expect(vinProblem('1FUJHHDR2NLNA1234')).toBeNull());
  it('asks for a VIN when empty', () => expect(vinProblem(' ')).toBe('Enter the 17-character VIN.'));
  it('rejects I, O and Q', () => expect(vinProblem('1FUJHHDR2NLNO1234')).toMatch(/never use the letters I, O or Q/));
  it('says how many characters were entered', () => expect(vinProblem('1FUJHHDR2')).toMatch(/\(9 entered\)/));
});

describe('tidyMake', () => {
  it('title-cases long names', () => expect(tidyMake('FREIGHTLINER')).toBe('Freightliner'));
  it('handles several words', () => expect(tidyMake('GREAT DANE')).toBe('Great Dane'));
  it('keeps short all-capital names', () => expect(tidyMake('GMC')).toBe('GMC'));
});

describe('readDecoded', () => {
  it('reads make, model and year', () => {
    expect(readDecoded({ Results: [{ Make: 'KENWORTH', Model: 'T680', ModelYear: '2022' }] })).toEqual({ make: 'Kenworth', model: 'T680', year: '2022' });
  });
  it('drops a year that is not four digits', () => {
    expect(readDecoded({ Results: [{ Make: 'VOLVO TRUCK', Model: 'VNL', ModelYear: '' }] })).toEqual({ make: 'Volvo Truck', model: 'VNL', year: '' });
  });
  it('returns null when nothing was found', () => {
    expect(readDecoded({ Results: [{ Make: '', Model: '', ModelYear: '' }] })).toBeNull();
    expect(readDecoded({})).toBeNull();
    expect(readDecoded(null)).toBeNull();
  });
});

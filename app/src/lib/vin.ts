// VIN checks and decoding (release 1.36). Decoding asks the U.S. government's
// free VIN service (NHTSA vPIC) for the make, model and year; only the VIN is
// sent. The site's security settings allow that one address (vercel.json).

export const VIN_SERVICE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

// What is wrong with a VIN as typed, or null when it looks right.
export function vinProblem(vin: string): string | null {
  const v = vin.trim().toUpperCase();
  if (!v) return 'Enter the 17-character VIN.';
  if (/[IOQ]/.test(v)) return 'VINs never use the letters I, O or Q — check for 1 or 0.';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return `VIN must be exactly 17 letters and numbers (${v.length} entered).`;
  return null;
}

// 'FREIGHTLINER' → 'Freightliner'; 'great dane' → 'Great Dane'. Short
// all-capital names (e.g. 'GMC') stay as they are.
export function tidyMake(s: string): string {
  const t = s.trim();
  if (/^[A-Z]{2,3}$/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export interface Decoded { make: string; model: string; year: string }

// The service's answer, as make, model and year (null when it found nothing).
export function readDecoded(json: unknown): Decoded | null {
  const r = (json as { Results?: Record<string, unknown>[] })?.Results?.[0];
  if (!r) return null;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
  const make = tidyMake(str('Make'));
  const model = str('Model');
  const year = /^\d{4}$/.test(str('ModelYear')) ? str('ModelYear') : '';
  if (!make && !model && !year) return null;
  return { make, model, year };
}

export async function decodeVin(vin: string): Promise<Decoded | { error: string }> {
  const problem = vinProblem(vin);
  if (problem) return { error: problem };
  try {
    const res = await fetch(`${VIN_SERVICE}/${encodeURIComponent(vin.trim().toUpperCase())}?format=json`);
    if (!res.ok) return { error: 'The VIN service did not answer. Try again, or type the make, model and year.' };
    const decoded = readDecoded(await res.json());
    return decoded ?? { error: 'No vehicle was found for this VIN. Check it, or type the make, model and year.' };
  } catch {
    return { error: 'Could not reach the VIN service. Check your connection, or type the make, model and year.' };
  }
}

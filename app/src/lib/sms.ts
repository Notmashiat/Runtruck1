import type { Settings } from '../data/settings';
import { getSettings } from './settingsStore';

// Texting through the company's own provider (Settings › Integrations, release
// 1.21). The message goes out from RunTruck's server function (api/sms.ts),
// which passes it to Twilio with the company's credentials.

type Integrations = Settings['integrations'];

export const twilioConnected = (i: Integrations = getSettings().integrations) =>
  Boolean(i.twilioSid.trim() && i.twilioToken.trim() && i.twilioFrom.trim());

// A phone number as Twilio needs it: +1 and ten digits for a US number,
// or + and the digits when it was typed with a country code. '' if it cannot be.
export function e164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (phone.trim().startsWith('+')) return digits.length >= 8 ? `+${digits}` : '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

// Sends one text. Resolves to null when it went out, or to what went wrong.
export async function sendText(to: string, body: string, i: Integrations = getSettings().integrations): Promise<string | null> {
  if (!twilioConnected(i)) return 'Please connect to a provider.';
  const number = e164(to);
  if (!number) return 'The driver’s phone number is missing or not valid.';
  const from = e164(i.twilioFrom);
  if (!from) return 'The sending number in Settings › Integrations is not valid.';
  try {
    const res = await fetch('/api/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: i.twilioSid.trim(), token: i.twilioToken.trim(), from, to: number, body }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res.ok && data?.ok) return null;
    return data?.error || 'The text could not be sent. Try again in a moment.';
  } catch {
    return 'The text could not be sent: RunTruck’s messaging service could not be reached.';
  }
}

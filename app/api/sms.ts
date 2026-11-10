// Vercel function: POST /api/sms sends one text message through the calling
// company's own Twilio account (Settings › Integrations). RunTruck keeps no
// messaging account of its own: the company's Account SID, Auth Token and
// sending number come with each request and are passed straight to Twilio,
// over HTTPS, and are not stored or logged here.
//
// Request:  { sid, token, from, to, body }   (numbers as +15551234567)
// Response: 200 { ok: true, id }  or  4xx/5xx { ok: false, error }

const SID = /^AC[0-9a-fA-F]{32}$/;
const PHONE = /^\+[1-9]\d{7,14}$/;
const MAX_BODY = 1600; // Twilio's limit for one message

interface SmsRequest {
  sid?: unknown;
  token?: unknown;
  from?: unknown;
  to?: unknown;
  body?: unknown;
}

const reply = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function POST(request: Request): Promise<Response> {
  let input: SmsRequest;
  try {
    input = (await request.json()) as SmsRequest;
  } catch {
    return reply(400, { ok: false, error: 'The request could not be read.' });
  }
  const sid = text(input.sid);
  const token = text(input.token);
  const from = text(input.from);
  const to = text(input.to);
  const body = typeof input.body === 'string' ? input.body : '';

  if (!SID.test(sid) || !token) return reply(400, { ok: false, error: 'The Twilio Account SID or Auth Token is missing or not valid.' });
  if (!PHONE.test(from)) return reply(400, { ok: false, error: 'The sending number is not a valid phone number.' });
  if (!PHONE.test(to)) return reply(400, { ok: false, error: 'The driver’s phone number is not a valid phone number.' });
  if (!body.trim()) return reply(400, { ok: false, error: 'The message is empty.' });
  if (body.length > MAX_BODY) return reply(400, { ok: false, error: `The message is longer than ${MAX_BODY} characters.` });

  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
  } catch {
    return reply(502, { ok: false, error: 'Twilio could not be reached. Try again in a moment.' });
  }
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok) {
    const why = res.status === 401 ? 'Twilio did not accept the Account SID and Auth Token.' : data.message || `Twilio refused the message (${res.status}).`;
    return reply(res.status >= 500 ? 502 : 400, { ok: false, error: why });
  }
  return reply(200, { ok: true, id: data.sid ?? '' });
}

export function GET(): Response {
  return reply(405, { ok: false, error: 'Use POST.' });
}

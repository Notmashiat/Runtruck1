import { describe, expect, it } from 'vitest';
import { SHARED_FRESH_MS, openSessionElsewhere } from './account';

const now = Date.parse('2026-11-12T12:00:00Z');
const session = { started: '2026-11-12T09:00:00Z', expires: '2026-11-12T21:00:00Z' };

describe('openSessionElsewhere', () => {
  it('takes a session another window is using', () => {
    expect(openSessionElsewhere({ session, beat: now - 5_000 }, now)).toBe(JSON.stringify(session));
  });
  it('not once every window has been closed for a while', () => {
    expect(openSessionElsewhere({ session, beat: now - SHARED_FRESH_MS - 1 }, now)).toBeNull();
  });
  it('not a session that has run out', () => {
    expect(openSessionElsewhere({ session: { ...session, expires: '2026-11-12T11:00:00Z' }, beat: now }, now)).toBeNull();
  });
  it('not after logging out', () => {
    expect(openSessionElsewhere({ ended: session.started }, now)).toBeNull();
    expect(openSessionElsewhere(null, now)).toBeNull();
  });
});

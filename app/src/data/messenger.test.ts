import { describe, expect, it } from 'vitest';
import { DRIVER_ROLE, chatName, chatOrder, initials, preview, roleIn, seedMessenger, syncTruckGroups, toneOf, totalUnread, truckChatId, unreadIn, type MessengerState } from './messenger';

const now = Date.parse('2026-11-17T18:00:00Z');
const ME = { name: 'Rosa Medina', role: 'Admin' };
const OFFICE = [{ name: 'Rosa Medina', role: 'Admin' }, { name: 'Evan Brooks', role: 'Dispatcher' }, { name: 'Grace Whitman', role: 'Accounting' }];
const TRUCKS = [{ unit: 'T-114', driver: 'Marcus Hale' }, { unit: 'T-107', driver: 'Dara Whitfield' }, { unit: 'T-200', driver: '' }];
const seed = () => seedMessenger(ME, ['Marcus Hale', 'Dara Whitfield', 'Ana Cortez', 'Ellis Nakamura'], OFFICE, { now, trucks: TRUCKS, loads: [{ unit: 'T-114', id: 'L-1', summary: 'Load #L-1' }] });

describe('messenger', () => {
  it('starts with a group for the drivers, one for the office and a chat with each person', () => {
    const s = seed();
    expect(s.chats.map((c) => c.id)).toContain('g-drivers');
    expect(s.chats.map((c) => c.id)).toContain('g-office');
    expect(s.chats.filter((c) => c.kind === 'private')).toHaveLength(6);
    expect(s.chats.filter((c) => c.truck).map((c) => c.title)).toEqual(['Marcus Hale Truck T-114', 'Dara Whitfield Truck T-107', 'Truck T-200']);
    expect(s.chats.find((c) => c.id === 'g-office')?.members).not.toContain(undefined);
  });
  it('a client company starts with chats but no messages', () => {
    expect(seedMessenger({ name: 'Pat', role: 'Admin' }, ['Lee'], [], { now, demo: false }).messages).toHaveLength(0);
  });
  it('counts unread messages from others since the chat was opened', () => {
    const s: MessengerState = {
      chats: [{ id: 'c', kind: 'private', title: 'Lee', members: ['Me', 'Lee'] }],
      messages: [
        { id: '1', chatId: 'c', from: 'Lee', at: '2026-11-17T10:00:00Z', text: 'a' },
        { id: '2', chatId: 'c', from: 'Me', at: '2026-11-17T11:00:00Z', text: 'b' },
        { id: '3', chatId: 'c', from: 'Lee', at: '2026-11-17T12:00:00Z', text: 'c' },
      ],
      read: { c: '2026-11-17T10:30:00Z' },
    };
    expect(unreadIn(s, 'c', 'Me')).toBe(1);
    expect(totalUnread({ ...s, chats: [{ ...s.chats[0], muted: true }] }, 'Me')).toBe(0);
  });
  it('previews the last message the way a chat list does', () => {
    expect(preview(undefined, 'Me', 'private').text).toBe('No messages yet');
    expect(preview({ id: '1', chatId: 'c', from: 'Me', at: '', text: 'On my way' }, 'Me', 'private')).toEqual({ who: 'You', text: 'On my way' });
    expect(preview({ id: '1', chatId: 'g', from: 'Marcus Hale', at: '', text: 'Loaded' }, 'Me', 'group')).toEqual({ who: 'Marcus', text: 'Loaded' });
    expect(preview({ id: '1', chatId: 'c', from: 'Lee', at: '', file: { id: 'f', name: 'x.jpg', type: 'image/jpeg', size: 1, added: '' } }, 'Me', 'private').text).toBe('Photo');
  });
  it('lists pinned chats first, then the newest', () => {
    const order = chatOrder(seed()).map((c) => c.id);
    expect(order[0]).toBe('g-drivers');
  });
  it('names, initials and colours', () => {
    const s = seed();
    const lee = s.chats.find((c) => c.kind === 'private') ?? s.chats[0];
    expect(chatName(lee, 'Rosa Medina')).not.toBe('Rosa Medina');
    expect(initials('Marcus Hale')).toBe('MH');
    expect(toneOf('Marcus Hale')).toBe(toneOf('Marcus Hale'));
    expect(toneOf('Marcus Hale')).toBeLessThan(7);
  });
  it('a truck group holds its driver and the dispatchers, with their roles', () => {
    const s = seed();
    const g = s.chats.find((c) => c.id === truckChatId('T-114'));
    expect(g?.members).toEqual(['Marcus Hale', 'Rosa Medina', 'Evan Brooks']);
    expect(g && roleIn(g, 'Marcus Hale')).toBe(DRIVER_ROLE);
    expect(g && roleIn(g, 'Evan Brooks')).toBe('Dispatcher');
    // The demo dispatch card is in the group.
    expect(s.messages.some((m) => m.chatId === g?.id && m.load === 'L-1')).toBe(true);
  });
  it('keeps truck groups in step with the fleet', () => {
    const s = seed();
    const added = syncTruckGroups(s, [...TRUCKS, { unit: 'T-300', driver: 'Lee Park' }], ME, OFFICE);
    expect(added.chats.find((c) => c.id === truckChatId('T-300'))?.title).toBe('Lee Park Truck T-300');
    const moved = syncTruckGroups(s, [{ unit: 'T-114', driver: 'Ana Cortez' }], ME, OFFICE);
    const g = moved.chats.find((c) => c.id === truckChatId('T-114'));
    expect(g?.title).toBe('Ana Cortez Truck T-114');
    expect(g?.members[0]).toBe('Ana Cortez');
    // Nothing changed: the same state back.
    expect(syncTruckGroups(s, TRUCKS, ME, OFFICE)).toBe(s);
  });
  it('previews a dispatched load', () => {
    expect(preview({ id: '1', chatId: 't', from: 'Me', at: '', load: 'L-9', text: 'Load #L-9' }, 'Me', 'group').text).toBe('Load L-9 dispatched');
  });
});

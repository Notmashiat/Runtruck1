// The messenger's chats (release 1.42), shared by the messenger panel and by
// anything that posts to a chat — Dispatch to driver sends the load summary to
// the truck's group. Kept under the company's ID in this browser, and taken up
// by other tabs when they change (lib/storage.ts).
import { useSyncExternalStore } from 'react';
import type { ChatMessage, MessengerState } from '../data/messenger';
import { truckChatId } from '../data/messenger';
import { readScoped, scopedKey } from './account';
import { onStorageChange, writeJson } from './storage';

const KEY = 'runtruck-messenger';

function parse(raw: string | null): MessengerState | null {
  try {
    const s = JSON.parse(raw ?? 'null') as MessengerState | null;
    return s && Array.isArray(s.chats) && Array.isArray(s.messages) && s.read && typeof s.read === 'object' ? s : null;
  } catch {
    return null;
  }
}

let current: MessengerState | null = parse(readScoped(KEY));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

onStorageChange(scopedKey(KEY), (raw) => {
  current = parse(raw);
  emit();
});

export function getMessenger(): MessengerState | null {
  return current;
}

export function setMessenger(next: MessengerState) {
  if (next === current) return;
  current = next;
  writeJson(scopedKey(KEY), next);
  emit();
}

export function updateMessenger(fn: (s: MessengerState) => MessengerState) {
  if (current) setMessenger(fn(current));
}

export function useMessenger(): MessengerState | null {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, () => current);
}

export const newMessageId = () => `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Post to a truck's group chat. Returns the chat's title, or null when the
// truck has no chat (yet).
export function postToTruck(unit: string, message: Omit<ChatMessage, 'id' | 'at' | 'chatId'>): string | null {
  const chat = current?.chats.find((c) => c.id === truckChatId(unit));
  if (!current || !chat) return null;
  const at = new Date().toISOString();
  setMessenger({ ...current, messages: [...current.messages, { ...message, id: newMessageId(), at, chatId: chat.id }], read: { ...current.read, [chat.id]: at } });
  return chat.title;
}

import { describe, expect, it } from 'vitest';
import {
  PENDING_CONFIRMATION_TTL_MS,
  createInMemoryPendingConfirmationStore,
} from '../../src/modules/voice/pending-confirmation-store';
import type { PendingConfirmation } from '../../src/modules/concierge/prepare-tool-result';

const NOW = new Date('2026-08-30T12:00:00Z');

const BOOKING: PendingConfirmation = {
  kind: 'BOOKING',
  review: { guestName: 'Ahmed' },
  confirmationToken: 'token-1',
};

const EVENT: PendingConfirmation = {
  kind: 'EVENT',
  review: { guestName: 'Sana' },
  confirmationToken: 'token-2',
};

describe('createInMemoryPendingConfirmationStore', () => {
  it('returns null for a session that has never had anything set', () => {
    const store = createInMemoryPendingConfirmationStore();
    expect(store.get('session-1', NOW)).toBeNull();
  });

  it('returns the value set for a session', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    expect(store.get('session-1', NOW)).toEqual(BOOKING);
  });

  it('is isolated per session', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    expect(store.get('session-2', NOW)).toBeNull();
  });

  it('the latest set() for a session replaces the previous value — same "only the latest wins" rule as text chat', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    store.set('session-1', EVENT, NOW);
    expect(store.get('session-1', NOW)).toEqual(EVENT);
  });

  it('clear() removes the stored value', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    store.clear('session-1');
    expect(store.get('session-1', NOW)).toBeNull();
  });

  it('clear() on a session with nothing stored is a safe no-op', () => {
    const store = createInMemoryPendingConfirmationStore();
    expect(() => store.clear('never-set')).not.toThrow();
  });

  it('expires after the TTL, returning null rather than a stale draft', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    const afterTtl = new Date(NOW.getTime() + PENDING_CONFIRMATION_TTL_MS + 1);
    expect(store.get('session-1', afterTtl)).toBeNull();
  });

  it('is still present just before the TTL boundary', () => {
    const store = createInMemoryPendingConfirmationStore();
    store.set('session-1', BOOKING, NOW);
    const justBefore = new Date(NOW.getTime() + PENDING_CONFIRMATION_TTL_MS - 1);
    expect(store.get('session-1', justBefore)).toEqual(BOOKING);
  });

  it('respects a custom TTL passed to the factory', () => {
    const store = createInMemoryPendingConfirmationStore(1000);
    store.set('session-1', BOOKING, NOW);
    expect(store.get('session-1', new Date(NOW.getTime() + 500))).toEqual(BOOKING);
    expect(store.get('session-1', new Date(NOW.getTime() + 1500))).toBeNull();
  });
});

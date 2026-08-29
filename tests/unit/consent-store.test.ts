import { describe, expect, it } from 'vitest';
import { createInMemoryConsentEventStore } from '../../src/modules/consent/consent-store';
import { buildConsentEvent } from '../../src/lib/domain/consent-event';

function eventAt(occurredAt: string, sessionId = 'session-1') {
  return buildConsentEvent({
    sessionId,
    category: 'MICROPHONE',
    granted: true,
    policyVersion: '1',
    source: 'voice_panel',
    correlationId: 'corr-1',
    now: () => new Date(occurredAt),
  });
}

describe('createInMemoryConsentEventStore', () => {
  it('append/list behaves like any other AppendOnlySink', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventAt('2026-08-01T00:00:00Z'));
    await store.append(eventAt('2026-08-02T00:00:00Z'));
    const events = await store.list();
    expect(events).toHaveLength(2);
  });

  it('list returns a defensive copy, not the live internal array', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventAt('2026-08-01T00:00:00Z'));
    const events = await store.list();
    (events as unknown[]).push({});
    expect(await store.list()).toHaveLength(1);
  });

  it('purgeExpiredBefore removes only events older than the cutoff, returns the removed count', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventAt('2026-01-01T00:00:00Z'));
    await store.append(eventAt('2026-06-01T00:00:00Z'));
    await store.append(eventAt('2026-08-29T00:00:00Z'));

    const purged = await store.purgeExpiredBefore(new Date('2026-07-01T00:00:00Z'));
    expect(purged).toBe(2);

    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.occurredAt).toBe('2026-08-29T00:00:00.000Z');
  });

  it('purgeExpiredBefore with a cutoff before every event removes nothing', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventAt('2026-08-01T00:00:00Z'));
    const purged = await store.purgeExpiredBefore(new Date('2020-01-01T00:00:00Z'));
    expect(purged).toBe(0);
    expect(await store.list()).toHaveLength(1);
  });

  it('an event exactly at the cutoff is kept, not purged (strict less-than)', async () => {
    const store = createInMemoryConsentEventStore();
    const cutoff = new Date('2026-08-29T00:00:00Z');
    await store.append(eventAt(cutoff.toISOString()));
    const purged = await store.purgeExpiredBefore(cutoff);
    expect(purged).toBe(0);
    expect(await store.list()).toHaveLength(1);
  });
});

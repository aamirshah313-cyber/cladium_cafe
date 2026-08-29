import { describe, expect, it } from 'vitest';
import { runConsentRetentionJob } from '../../src/modules/consent/retention';
import { createInMemoryConsentEventStore } from '../../src/modules/consent/consent-store';
import { buildConsentEvent } from '../../src/lib/domain/consent-event';
import { CONSENT_EVENT_RETENTION_DAYS } from '../../src/modules/consent/policy';

const NOW = new Date('2026-08-29T12:00:00Z');

function eventDaysAgo(days: number, sessionId = 'session-1') {
  const occurredAt = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return buildConsentEvent({
    sessionId,
    category: 'MICROPHONE',
    granted: true,
    policyVersion: '1',
    source: 'voice_panel',
    correlationId: 'corr-1',
    now: () => occurredAt,
  });
}

describe('runConsentRetentionJob', () => {
  it('purges only events older than the retention window, using the default retention days', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventDaysAgo(CONSENT_EVENT_RETENTION_DAYS + 10));
    await store.append(eventDaysAgo(CONSENT_EVENT_RETENTION_DAYS - 10));
    await store.append(eventDaysAgo(1));

    const summary = await runConsentRetentionJob({ store, now: () => NOW });

    expect(summary.purgedCount).toBe(1);
    expect(summary.retentionDays).toBe(CONSENT_EVENT_RETENTION_DAYS);
    expect(summary.ranAt).toBe(NOW.toISOString());
    expect(await store.list()).toHaveLength(2);
  });

  it('honors an explicit retentionDays override instead of the default', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventDaysAgo(45));
    await store.append(eventDaysAgo(5));

    const summary = await runConsentRetentionJob({ store, retentionDays: 30, now: () => NOW });

    expect(summary.purgedCount).toBe(1);
    expect(summary.retentionDays).toBe(30);
    expect(await store.list()).toHaveLength(1);
  });

  it('running the job twice in a row is idempotent — the second run purges nothing new', async () => {
    const store = createInMemoryConsentEventStore();
    await store.append(eventDaysAgo(CONSENT_EVENT_RETENTION_DAYS + 5));

    const first = await runConsentRetentionJob({ store, now: () => NOW });
    expect(first.purgedCount).toBe(1);

    const second = await runConsentRetentionJob({ store, now: () => NOW });
    expect(second.purgedCount).toBe(0);
  });

  it('an empty store purges nothing', async () => {
    const store = createInMemoryConsentEventStore();
    const summary = await runConsentRetentionJob({ store, now: () => NOW });
    expect(summary.purgedCount).toBe(0);
  });
});

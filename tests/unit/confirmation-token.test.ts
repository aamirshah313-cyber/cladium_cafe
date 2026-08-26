import { describe, expect, it } from 'vitest';
import {
  consumeConfirmationToken,
  createInMemoryConfirmationTokenStore,
  issueConfirmationToken,
} from '../../src/lib/domain/confirmation-token';

const ISSUED_AT = () => new Date('2026-08-26T12:00:00Z');

async function issue(store: ReturnType<typeof createInMemoryConfirmationTokenStore>) {
  return issueConfirmationToken(store, {
    sessionId: 'session-1',
    action: 'TAKEAWAY_REQUEST',
    reviewHash: 'review-hash-a',
    ttlSeconds: 600,
    now: ISSUED_AT,
  });
}

describe('issueConfirmationToken', () => {
  it('never stores the raw token — only its hash', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken, record } = await issue(store);
    expect(record.tokenHash).not.toBe(rawToken);
    expect([...store.records.values()][0]?.tokenHash).toBe(record.tokenHash);
  });

  it('issues distinct tokens on repeated calls', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const a = await issue(store);
    const b = await issue(store);
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe('consumeConfirmationToken', () => {
  it('round-trips a freshly issued token', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);

    const result = await consumeConfirmationToken(store, {
      rawToken,
      sessionId: 'session-1',
      action: 'TAKEAWAY_REQUEST',
      reviewHash: 'review-hash-a',
      now: ISSUED_AT,
    });

    expect(result.ok).toBe(true);
  });

  it('is single-use — a second consume of the same token fails', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);
    const input = {
      rawToken,
      sessionId: 'session-1',
      action: 'TAKEAWAY_REQUEST' as const,
      reviewHash: 'review-hash-a',
      now: ISSUED_AT,
    };

    const first = await consumeConfirmationToken(store, input);
    const second = await consumeConfirmationToken(store, input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('NOT_FOUND');
  });

  it('rejects an unknown token', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const result = await consumeConfirmationToken(store, {
      rawToken: 'never-issued',
      sessionId: 'session-1',
      action: 'TAKEAWAY_REQUEST',
      reviewHash: 'review-hash-a',
      now: ISSUED_AT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects a token presented from a different session', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);
    const result = await consumeConfirmationToken(store, {
      rawToken,
      sessionId: 'session-2',
      action: 'TAKEAWAY_REQUEST',
      reviewHash: 'review-hash-a',
      now: ISSUED_AT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects a token presented for the wrong action', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);
    const result = await consumeConfirmationToken(store, {
      rawToken,
      sessionId: 'session-1',
      action: 'BOOKING_REQUEST',
      reviewHash: 'review-hash-a',
      now: ISSUED_AT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects an expired token', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);
    const afterExpiry = () => new Date('2026-08-26T12:20:00Z'); // ttl was 600s = 10 minutes
    const result = await consumeConfirmationToken(store, {
      rawToken,
      sessionId: 'session-1',
      action: 'TAKEAWAY_REQUEST',
      reviewHash: 'review-hash-a',
      now: afterExpiry,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns STALE_REVIEW when the reviewed draft changed since issuance', async () => {
    const store = createInMemoryConfirmationTokenStore();
    const { rawToken } = await issue(store);
    const result = await consumeConfirmationToken(store, {
      rawToken,
      sessionId: 'session-1',
      action: 'TAKEAWAY_REQUEST',
      reviewHash: 'review-hash-CHANGED',
      now: ISSUED_AT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_REVIEW');
  });
});

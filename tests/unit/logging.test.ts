import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logging';
import { REDACTED } from '../../src/lib/redaction';
import { internalError, validationFailed } from '../../src/lib/errors';
import { createMemorySink, fixedNow, sensitivePayload } from '../fixtures/logging';

describe('structured logger', () => {
  it('emits level, event, and ISO timestamp', () => {
    const sink = createMemorySink();
    createLogger({ sink, now: fixedNow }).info('menu.viewed');

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({
      level: 'info',
      event: 'menu.viewed',
      timestamp: '2026-08-23T12:00:00.000Z',
    });
  });

  it('redacts every field it logs', () => {
    const sink = createMemorySink();
    createLogger({ sink, now: fixedNow }).info('takeaway.draft.updated', { ...sensitivePayload });

    const fields = sink.entries[0]?.fields ?? {};
    expect(fields.phone).toBe(REDACTED);
    expect(fields.notes).toBe(REDACTED);
    expect(fields.guestName).toBe(REDACTED);
    expect(JSON.stringify(sink.entries[0])).not.toContain('Test Guest');
    expect(JSON.stringify(sink.entries[0])).not.toContain('should-never-appear');
  });

  it('keeps safe operational fields intact', () => {
    const sink = createMemorySink();
    createLogger({ sink, now: fixedNow }).info('takeaway.request.submitted', {
      quantity: 3,
      status: 'REQUESTED',
      menuVersion: 7,
    });

    expect(sink.entries[0]?.fields).toMatchObject({
      quantity: 3,
      status: 'REQUESTED',
      menuVersion: 7,
    });
  });

  it('stamps the correlation id on every entry from a child logger', () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, now: fixedNow }).withCorrelationId('corr-123');
    logger.warn('rate.limit.near');
    logger.error('rate.limit.exceeded');

    expect(sink.entries.map((e) => e.correlationId)).toEqual(['corr-123', 'corr-123']);
  });

  it('logs an AppError as safe metadata, keeping the internal message server-side', () => {
    const sink = createMemorySink();
    createLogger({ sink, now: fixedNow }).logAppError(internalError('pool exhausted', 'corr-9'));

    const entry = sink.entries[0];
    expect(entry?.level).toBe('error');
    expect(entry?.event).toBe('app.error');
    expect(entry?.fields).toMatchObject({
      code: 'INTERNAL',
      status: 500,
      internalMessage: 'pool exhausted',
    });
  });

  it('logs only the count of validation issues, never their content', () => {
    const sink = createMemorySink();
    createLogger({ sink, now: fixedNow }).logAppError(
      validationFailed([
        { path: 'phone', code: 'invalid_string' },
        { path: 'name', code: 'too_small' },
      ]),
    );

    const fields = sink.entries[0]?.fields ?? {};
    expect(fields.issueCount).toBe(2);
    expect(fields.issues).toBeUndefined();
  });

  it('routes each level to one entry with the right level recorded', () => {
    const sink = createMemorySink();
    const logger = createLogger({ sink, now: fixedNow });
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(sink.entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });
});

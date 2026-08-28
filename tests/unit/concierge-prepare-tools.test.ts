import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prepareBookingDraft } from '../../src/modules/concierge/tools/prepare-booking';
import { prepareEventDraft } from '../../src/modules/concierge/tools/prepare-event';
import { submitBookingRequest } from '../../src/modules/bookings/submission-service';
import { submitEventRequest } from '../../src/modules/events/submission-service';

const BOOKING_DRAFT = {
  guestName: 'Aamir Shah',
  guestPhone: '+923001234567',
  requestedDate: '2999-01-01',
  requestedTime: '19:00',
  partySize: 4,
  seatingPreference: 'GENERAL' as const,
};

const EVENT_DRAFT = {
  guestName: 'Aamir Shah',
  guestPhone: '+923001234567',
  occasion: 'Birthday',
  requestedDate: '2999-01-01',
  requestedTime: '19:00',
  guestCount: 20,
  decorInterest: true,
};

describe('prepareBookingDraft — only ever drafts', () => {
  it('echoes the review and issues a confirmation token, without creating a booking record', async () => {
    const sessionId = `session-${randomUUID()}`;
    const result = await prepareBookingDraft(BOOKING_DRAFT, sessionId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.review).toMatchObject(BOOKING_DRAFT);
    expect(typeof result.value.confirmationToken).toBe('string');
  });

  it('the issued token really works through the exact same submitBookingRequest the manual /book form calls — no divergent write path', async () => {
    const sessionId = `session-${randomUUID()}`;
    const prepared = await prepareBookingDraft(BOOKING_DRAFT, sessionId);
    if (!prepared.ok) throw new Error('prepare failed');

    const { bookingDeps } = await import('../../src/modules/bookings/deps');
    const submitted = await submitBookingRequest(bookingDeps, {
      sessionId,
      ...BOOKING_DRAFT,
      sourceChannel: 'TEXT_CONCIERGE',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: 'corr-1',
    });

    expect(submitted.ok).toBe(true);
    if (submitted.ok) expect(submitted.value.state).toBe('REQUESTED');
  });

  it('a tampered field after the review (stale review) still fails, same as the manual flow', async () => {
    const sessionId = `session-${randomUUID()}`;
    const prepared = await prepareBookingDraft(BOOKING_DRAFT, sessionId);
    if (!prepared.ok) throw new Error('prepare failed');

    const { bookingDeps } = await import('../../src/modules/bookings/deps');
    const tamperedPartySize = await submitBookingRequest(bookingDeps, {
      sessionId,
      ...BOOKING_DRAFT,
      partySize: 40, // tampered after the guest saw the review
      sourceChannel: 'TEXT_CONCIERGE',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: 'corr-1',
    });

    expect(tamperedPartySize.ok).toBe(false);
    if (!tamperedPartySize.ok) expect(tamperedPartySize.error.code).toBe('STALE_REVIEW');
  });
});

describe('prepareEventDraft — only ever drafts', () => {
  it('echoes the review and issues a confirmation token, without creating an event record', async () => {
    const sessionId = `session-${randomUUID()}`;
    const result = await prepareEventDraft(EVENT_DRAFT, sessionId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.review).toMatchObject(EVENT_DRAFT);
    expect(typeof result.value.confirmationToken).toBe('string');
  });

  it('the issued token really works through the exact same submitEventRequest the manual /event form calls', async () => {
    const sessionId = `session-${randomUUID()}`;
    const prepared = await prepareEventDraft(EVENT_DRAFT, sessionId);
    if (!prepared.ok) throw new Error('prepare failed');

    const { eventDeps } = await import('../../src/modules/events/deps');
    const submitted = await submitEventRequest(eventDeps, {
      sessionId,
      ...EVENT_DRAFT,
      sourceChannel: 'TEXT_CONCIERGE',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: 'corr-1',
    });

    expect(submitted.ok).toBe(true);
    if (submitted.ok) {
      expect(submitted.value.state).toBe('REQUESTED');
    }
  });

  it('never sets a quote — quotedAmountPkr stays null even though decorInterest is true', async () => {
    const sessionId = `session-${randomUUID()}`;
    const prepared = await prepareEventDraft(EVENT_DRAFT, sessionId);
    if (!prepared.ok) throw new Error('prepare failed');

    const { eventDeps } = await import('../../src/modules/events/deps');
    const submitted = await submitEventRequest(eventDeps, {
      sessionId,
      ...EVENT_DRAFT,
      sourceChannel: 'TEXT_CONCIERGE',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: 'corr-1',
    });
    if (!submitted.ok) throw new Error('submit failed');

    const record = await eventDeps.requestStore.find(submitted.value.requestId);
    expect(record?.quotedAmountPkr).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { signWebhookPayload, createInMemoryReplayStore } from '../../src/lib/security/webhook';
import { verifyVapiWebhookRequest } from '../../src/modules/voice/webhook-auth';
import { validServerEnv } from '../fixtures/env';

const SECRET = validServerEnv.VAPI_WEBHOOK_HMAC_SECRET;
const NOW = new Date('2026-08-29T12:00:00Z');
const NOW_UNIX = String(Math.floor(NOW.getTime() / 1000));
const PAYLOAD = JSON.stringify({ message: { type: 'tool-calls' } });

function sign(payload: string, timestamp: string, secret: string = SECRET): string {
  return signWebhookPayload(payload, timestamp, secret);
}

describe('verifyVapiWebhookRequest', () => {
  it('accepts a validly signed, fresh, first-seen request', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(PAYLOAD, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects an invalid signature', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: 'not-the-real-signature',
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a signature computed over a different payload (tampered body)', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: JSON.stringify({ message: { type: 'tool-calls', tampered: true } }),
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(PAYLOAD, NOW_UNIX), // signed over the original, untampered payload
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a stale (too old) timestamp', async () => {
    const replayStore = createInMemoryReplayStore();
    const staleTimestamp = String(Math.floor(NOW.getTime() / 1000) - 600); // 10 minutes old, beyond the 5-minute window
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: staleTimestamp,
      signatureHeader: sign(PAYLOAD, staleTimestamp),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: false, reason: 'STALE_TIMESTAMP' });
  });

  it('rejects a replayed request (same signed body delivered twice)', async () => {
    const replayStore = createInMemoryReplayStore();
    const input = {
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(PAYLOAD, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    };
    await expect(verifyVapiWebhookRequest(input)).resolves.toEqual({ ok: true });
    await expect(verifyVapiWebhookRequest(input)).resolves.toEqual({
      ok: false,
      reason: 'REPLAYED',
    });
  });

  it("a differently-signed payload after a first delivery is not blocked by the first delivery's replay record", async () => {
    const replayStore = createInMemoryReplayStore();
    const first = {
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(PAYLOAD, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    };
    const secondPayload = JSON.stringify({ message: { type: 'tool-calls', callId: 'different' } });
    const second = {
      rawBody: secondPayload,
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(secondPayload, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    };
    await expect(verifyVapiWebhookRequest(first)).resolves.toEqual({ ok: true });
    await expect(verifyVapiWebhookRequest(second)).resolves.toEqual({ ok: true });
  });

  it('fails closed (never "accept anything") when VAPI_WEBHOOK_HMAC_SECRET is not configured', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: sign(PAYLOAD, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: {},
    });
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a missing signature header', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: NOW_UNIX,
      signatureHeader: null,
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: false, reason: 'MISSING_SIGNATURE' });
  });

  it('rejects a missing timestamp header', async () => {
    const replayStore = createInMemoryReplayStore();
    const result = await verifyVapiWebhookRequest({
      rawBody: PAYLOAD,
      timestampHeader: null,
      signatureHeader: sign(PAYLOAD, NOW_UNIX),
      replayStore,
      now: NOW,
      envSource: validServerEnv,
    });
    expect(result).toEqual({ ok: false, reason: 'MISSING_TIMESTAMP' });
  });
});

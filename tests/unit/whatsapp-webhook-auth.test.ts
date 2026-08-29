import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from '../../src/modules/integrations/whatsapp-webhook-auth';

const APP_SECRET = 'app-secret-for-tests';
const BODY = '{"object":"whatsapp_business_account","entry":[]}';

function realSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyWhatsAppWebhookSignature', () => {
  it('accepts a correctly computed sha256= signature over the raw body', () => {
    const signature = realSignature(BODY, APP_SECRET);
    expect(verifyWhatsAppWebhookSignature(BODY, signature, APP_SECRET)).toBe(true);
  });

  it('rejects when no app secret is configured — fails closed', () => {
    const signature = realSignature(BODY, APP_SECRET);
    expect(verifyWhatsAppWebhookSignature(BODY, signature, undefined)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyWhatsAppWebhookSignature(BODY, null, APP_SECRET)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(BODY, undefined, APP_SECRET)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const raw = createHmac('sha256', APP_SECRET).update(BODY).digest('hex');
    expect(verifyWhatsAppWebhookSignature(BODY, raw, APP_SECRET)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const signature = realSignature(BODY, 'a-different-secret');
    expect(verifyWhatsAppWebhookSignature(BODY, signature, APP_SECRET)).toBe(false);
  });

  it('rejects a tampered body — the signature was computed over a different payload', () => {
    const signature = realSignature(BODY, APP_SECRET);
    expect(verifyWhatsAppWebhookSignature(`${BODY}tampered`, signature, APP_SECRET)).toBe(false);
  });

  it('rejects a garbled hex value even with the correct prefix', () => {
    expect(verifyWhatsAppWebhookSignature(BODY, 'sha256=not-hex', APP_SECRET)).toBe(false);
  });
});

describe('verifyWhatsAppWebhookChallenge', () => {
  const VERIFY_TOKEN = 'configured-verify-token';

  it('returns the challenge value on a correct subscribe handshake', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'subscribe', verifyToken: VERIFY_TOKEN, challenge: 'echo-me-back' },
      VERIFY_TOKEN,
    );
    expect(result).toBe('echo-me-back');
  });

  it('rejects when no verify token is configured — fails closed', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'subscribe', verifyToken: VERIFY_TOKEN, challenge: 'echo-me-back' },
      undefined,
    );
    expect(result).toBeNull();
  });

  it('rejects a mode other than "subscribe"', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'unsubscribe', verifyToken: VERIFY_TOKEN, challenge: 'echo-me-back' },
      VERIFY_TOKEN,
    );
    expect(result).toBeNull();
  });

  it('rejects a mismatched verify token', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'subscribe', verifyToken: 'wrong-token', challenge: 'echo-me-back' },
      VERIFY_TOKEN,
    );
    expect(result).toBeNull();
  });

  it('rejects a missing verify token', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'subscribe', verifyToken: null, challenge: 'echo-me-back' },
      VERIFY_TOKEN,
    );
    expect(result).toBeNull();
  });

  it('rejects a missing challenge value even with a correct token', () => {
    const result = verifyWhatsAppWebhookChallenge(
      { mode: 'subscribe', verifyToken: VERIFY_TOKEN, challenge: null },
      VERIFY_TOKEN,
    );
    expect(result).toBeNull();
  });
});

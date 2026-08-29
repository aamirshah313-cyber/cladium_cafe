import { describe, expect, it } from 'vitest';
import { createCsrfToken, guardMutation } from '../../src/lib/security/csrf';
import { buildContentSecurityPolicy, securityHeaders } from '../../src/lib/security/headers';
import { trustedOriginConfig } from '../../src/lib/security/origin';
import { createInMemoryRateLimiter } from '../../src/lib/security/rate-limit';
import { isSafeRedirectTarget, safeRedirectTarget } from '../../src/lib/security/redirect';
import {
  checkBodySize,
  checkContentLength,
  checkContentType,
  DEFAULT_MAX_BODY_BYTES,
} from '../../src/lib/security/request-limits';
import { redactFields, REDACTED } from '../../src/lib/redaction';
import {
  createInMemoryReplayStore,
  signWebhookPayload,
  verifyWebhook,
  verifyWebhookSignature,
} from '../../src/lib/security/webhook';

const SECRET = 's'.repeat(32);
const ORIGINS = trustedOriginConfig(['https://cladium.example']);
const NOW = new Date('2026-08-25T00:00:00.000Z');

describe('mutation CSRF and origin guard', () => {
  it('accepts a same-origin mutation with the session-bound token', () => {
    const token = createCsrfToken('guest-1', SECRET);
    expect(
      guardMutation(
        {
          method: 'POST',
          origin: 'https://cladium.example',
          csrfToken: token,
          sessionId: 'guest-1',
          secret: SECRET,
        },
        ORIGINS,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects a forged origin even when it holds a valid token', () => {
    const token = createCsrfToken('guest-1', SECRET);
    expect(
      guardMutation(
        {
          method: 'POST',
          origin: 'https://evil.example',
          csrfToken: token,
          sessionId: 'guest-1',
          secret: SECRET,
        },
        ORIGINS,
      ),
    ).toEqual({ ok: false, reason: 'UNTRUSTED_ORIGIN' });
  });

  it('rejects a missing or forged CSRF token', () => {
    expect(
      guardMutation(
        { method: 'POST', origin: 'https://cladium.example', sessionId: 'guest-1', secret: SECRET },
        ORIGINS,
      ),
    ).toEqual({ ok: false, reason: 'MISSING_CSRF_TOKEN' });
    expect(
      guardMutation(
        {
          method: 'POST',
          origin: 'https://cladium.example',
          csrfToken: 'forged',
          sessionId: 'guest-1',
          secret: SECRET,
        },
        ORIGINS,
      ),
    ).toEqual({ ok: false, reason: 'BAD_CSRF_TOKEN' });
  });
});

describe('redirect and request limits', () => {
  it('allows only safe relative redirects', () => {
    expect(isSafeRedirectTarget('/en/menu?category=coffee')).toBe(true);
    for (const unsafe of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/x\nSet-Cookie: bad',
    ]) {
      expect(isSafeRedirectTarget(unsafe)).toBe(false);
    }
    expect(safeRedirectTarget('//evil.example', '/en')).toBe('/en');
  });

  it('rejects unsupported content types and oversized declared or actual bodies', () => {
    expect(checkContentType('text/plain').ok).toBe(false);
    expect(checkContentType('application/json; charset=utf-8').ok).toBe(true);
    expect(checkContentLength(String(DEFAULT_MAX_BODY_BYTES + 1)).ok).toBe(false);
    expect(checkContentLength(undefined).ok).toBe(true);
    expect(checkBodySize('x'.repeat(DEFAULT_MAX_BODY_BYTES + 1)).ok).toBe(false);
  });
});

describe('rate limiting and webhooks', () => {
  it('enforces an in-memory development limiter at the configured boundary', async () => {
    const limiter = createInMemoryRateLimiter();
    expect((await limiter.consume('guest-1', { max: 2, windowMs: 1000 }, NOW)).allowed).toBe(true);
    expect((await limiter.consume('guest-1', { max: 2, windowMs: 1000 }, NOW)).remaining).toBe(0);
    expect((await limiter.consume('guest-1', { max: 2, windowMs: 1000 }, NOW)).allowed).toBe(false);
  });

  it('rejects bad signatures and stale webhook timestamps', () => {
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    expect(
      verifyWebhookSignature({
        payload: '{"id":"evt-1"}',
        timestampHeader: timestamp,
        signatureHeader: 'forged',
        secret: SECRET,
        maxAgeSeconds: 300,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(
      verifyWebhookSignature({
        payload: '{}',
        timestampHeader: '0',
        signatureHeader: 'x',
        secret: SECRET,
        maxAgeSeconds: 300,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'STALE_TIMESTAMP' });
  });

  it('accepts a signed webhook once and rejects a replay', async () => {
    const payload = '{"id":"evt-1"}';
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const signatureHeader = signWebhookPayload(payload, timestamp, SECRET);
    const replayStore = createInMemoryReplayStore();
    const input = {
      payload,
      timestampHeader: timestamp,
      signatureHeader,
      secret: SECRET,
      maxAgeSeconds: 300,
      now: NOW,
      eventId: 'evt-1',
      replayStore,
    };
    await expect(verifyWebhook(input)).resolves.toEqual({ ok: true });
    await expect(verifyWebhook(input)).resolves.toEqual({ ok: false, reason: 'REPLAYED' });
  });
});

describe('headers and redaction', () => {
  it('sets enforcing CSP and browser-protection headers', () => {
    const headers = securityHeaders();
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });

  // Runbook Step 40: this module was found fully built and tested (Step
  // 12) but never actually applied to a response — `next.config.ts`
  // shipped no `headers()` at all. These cases cover the no-nonce
  // fallback `next.config.ts` now actually depends on.
  it("falls back to unsafe-inline for script/style when no nonce is supplied — the honest baseline Next.js's own inline hydration scripts need without a per-request nonce", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('drops the unsafe-inline fallback once a real nonce is supplied', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123' });
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('adds unsafe-eval only when allowEval is explicitly set (dev-only)', () => {
    expect(buildContentSecurityPolicy({ allowEval: true })).toContain('unsafe-eval');
    expect(buildContentSecurityPolicy()).not.toContain('unsafe-eval');
    expect(buildContentSecurityPolicy({ allowEval: false })).not.toContain('unsafe-eval');
  });

  it('never allows framing and always upgrades insecure requests, with or without a nonce', () => {
    for (const options of [{}, { nonce: 'x' }, { allowEval: true }]) {
      const csp = buildContentSecurityPolicy(options);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).toContain("object-src 'none'");
    }
  });

  it('removes PII, authorization, chat content, and webhook signatures from logs', () => {
    expect(
      redactFields({
        phone: '+923001234567',
        authorization: 'Bearer secret',
        message: 'private chat',
        signature: 'hmac',
        status: 200,
      }),
    ).toEqual({
      phone: REDACTED,
      authorization: REDACTED,
      message: REDACTED,
      signature: REDACTED,
      status: 200,
    });
  });
});

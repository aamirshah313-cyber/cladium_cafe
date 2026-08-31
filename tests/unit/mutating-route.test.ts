import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseMutatingRequest } from '../../src/lib/http/mutating-route';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const APP_URL = 'https://cladium.example';
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const bodySchema = z.object({ csrfToken: z.string(), value: z.string() });

/** Just enough of `NextRequest` for `parseMutatingRequest` — no `nextUrl.pathname`/etc. it never reads. */
function fakeRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Parameters<typeof parseMutatingRequest>[0] {
  const headers = new Headers(options.headers ?? {});
  return {
    method: options.method ?? 'POST',
    headers,
    nextUrl: { protocol: 'https:' },
    text: async () => JSON.stringify(options.body ?? { value: 'x' }),
  } as unknown as Parameters<typeof parseMutatingRequest>[0];
}

describe('parseMutatingRequest featureFlag option', () => {
  it('proceeds normally with no featureFlag option at all (unchanged existing behavior)', async () => {
    const outcome = await parseMutatingRequest(
      fakeRequest({ headers: { 'content-type': 'application/json' }, body: { value: 'x' } }),
      bodySchema,
    );
    // No CSRF token supplied in the body, so this still fails — but on the
    // CSRF guard, not a feature-flag check, proving no flag gate ran at all.
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.error.code).not.toBe('FEATURE_DISABLED');
  });

  it('rejects with FEATURE_DISABLED, before session resolution, when the flag is unset', async () => {
    delete process.env.FEATURE_TAKEAWAY_REQUESTS;
    const outcome = await parseMutatingRequest(
      fakeRequest({ headers: { 'content-type': 'application/json' } }),
      bodySchema,
      { featureFlag: 'FEATURE_TAKEAWAY_REQUESTS' },
    );
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) {
      expect(outcome.result.error.code).toBe('FEATURE_DISABLED');
      expect(outcome.result.error.status).toBe(404);
    }
    // Session resolution never ran, so no cookie was ever minted.
    expect(outcome.setCookieHeader).toBeNull();
  });

  it('rejects with FEATURE_DISABLED when the flag is explicitly "false"', async () => {
    process.env.FEATURE_TAKEAWAY_REQUESTS = 'false';
    const outcome = await parseMutatingRequest(
      fakeRequest({ headers: { 'content-type': 'application/json' } }),
      bodySchema,
      { featureFlag: 'FEATURE_TAKEAWAY_REQUESTS' },
    );
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.error.code).toBe('FEATURE_DISABLED');
  });

  it('proceeds past the flag check when the flag is "true"', async () => {
    process.env.FEATURE_TAKEAWAY_REQUESTS = 'true';
    const outcome = await parseMutatingRequest(
      fakeRequest({ headers: { 'content-type': 'application/json' } }),
      bodySchema,
      { featureFlag: 'FEATURE_TAKEAWAY_REQUESTS' },
    );
    // Still fails (no CSRF token in the body) — but past the flag gate,
    // proving "true" lets the request continue to the next check.
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.error.code).not.toBe('FEATURE_DISABLED');
    // Session resolution DID run this time, so a cookie was minted.
    expect(outcome.setCookieHeader).not.toBeNull();
  });

  it('does not require every other feature flag to be set (narrow check, not parseFeatureFlags)', async () => {
    delete process.env.FEATURE_BOOKING_REQUESTS;
    delete process.env.FEATURE_EVENT_REQUESTS;
    delete process.env.FEATURE_VOICE_EN;
    process.env.FEATURE_TAKEAWAY_REQUESTS = 'true';
    const outcome = await parseMutatingRequest(
      fakeRequest({ headers: { 'content-type': 'application/json' } }),
      bodySchema,
      { featureFlag: 'FEATURE_TAKEAWAY_REQUESTS' },
    );
    if (!outcome.result.ok) expect(outcome.result.error.code).not.toBe('FEATURE_DISABLED');
  });
});

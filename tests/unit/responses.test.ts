import { describe, expect, it } from 'vitest';
import {
  featureDisabledResponse,
  jsonError,
  jsonOk,
  jsonResult,
} from '../../src/lib/http/responses';
import { CORRELATION_HEADER } from '../../src/lib/correlation';
import { internalError, notFound, validationFailed } from '../../src/lib/errors';
import { err, ok } from '../../src/lib/result';

const CORR = '3f1a2b4c-5d6e-4f70-8901-234567890abc';

describe('jsonOk', () => {
  it('wraps data in an ok envelope with no-store caching', async () => {
    const response = jsonOk({ locale: 'en' }, { correlationId: CORR });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get(CORRELATION_HEADER)).toBe(CORR);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { locale: 'en' } });
  });

  it('honours an explicit status', () => {
    expect(jsonOk({}, { status: 201 }).status).toBe(201);
  });
});

describe('jsonError', () => {
  it('uses the error status and public projection', async () => {
    const response = jsonError(notFound(CORR));

    expect(response.status).toBe(404);
    expect(response.headers.get(CORRELATION_HEADER)).toBe(CORR);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'That item could not be found.', correlationId: CORR },
    });
  });

  it('never serializes internalMessage into the body', async () => {
    const response = jsonError(internalError('stack trace with secret', CORR));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('stack trace with secret');
    expect(body).not.toContain('internalMessage');
  });

  it('includes validation issue paths so the client can highlight fields', async () => {
    const response = jsonError(validationFailed([{ path: 'phone', code: 'invalid_string' }], CORR));
    const body = (await response.json()) as { error: { issues: unknown } };

    expect(response.status).toBe(400);
    expect(body.error.issues).toEqual([{ path: 'phone', code: 'invalid_string' }]);
  });
});

describe('jsonResult', () => {
  it('serializes a success', async () => {
    const response = jsonResult(ok({ id: 1 }), { correlationId: CORR });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { id: 1 } });
  });

  it('serializes a failure', () => {
    expect(jsonResult(err(notFound(CORR))).status).toBe(404);
  });
});

describe('featureDisabledResponse', () => {
  it('is indistinguishable from a genuine 404', async () => {
    const disabled = featureDisabledResponse(CORR);
    const missing = jsonError(notFound(CORR));

    expect(disabled.status).toBe(404);
    expect(missing.status).toBe(404);

    const body = (await disabled.json()) as { error: { message: string } };
    expect(body.error.message).not.toMatch(/disabled|flag|coming soon/i);
  });
});

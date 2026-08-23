import { describe, expect, it } from 'vitest';
import {
  appError,
  featureDisabled,
  httpStatusFor,
  internalError,
  staleReview,
  toPublicError,
  validationFailed,
  ERROR_CODES,
} from '../../src/lib/errors';
import {
  collectResults,
  err,
  isErr,
  isOk,
  mapError,
  mapResult,
  ok,
  unwrapOr,
} from '../../src/lib/result';

describe('Result', () => {
  it('discriminates ok and err', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('bad'))).toBe(true);
  });

  it('maps only the success value', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(mapResult(err('bad'), (n: number) => n * 2)).toEqual(err('bad'));
  });

  it('maps only the error', () => {
    expect(mapError(err('bad'), (e) => `${e}!`)).toEqual(err('bad!'));
    expect(mapError(ok(1), (e: string) => `${e}!`)).toEqual(ok(1));
  });

  it('falls back with unwrapOr', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err('bad'), 0)).toBe(0);
  });

  it('collects results and fails on the first error', () => {
    expect(collectResults([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(collectResults([ok(1), err('bad'), err('worse')])).toEqual(err('bad'));
  });
});

describe('AppError', () => {
  it('assigns the documented status for every code', () => {
    for (const code of ERROR_CODES) {
      expect(typeof httpStatusFor(code)).toBe('number');
    }
    expect(httpStatusFor('VALIDATION_FAILED')).toBe(400);
    expect(httpStatusFor('UNAUTHORIZED')).toBe(401);
    expect(httpStatusFor('FORBIDDEN')).toBe(403);
    expect(httpStatusFor('RATE_LIMITED')).toBe(429);
    expect(httpStatusFor('INTERNAL')).toBe(500);
  });

  it('reports a disabled feature as 404 so it does not advertise itself', () => {
    expect(featureDisabled().status).toBe(404);
    expect(httpStatusFor('FEATURE_DISABLED')).toBe(404);
  });

  it('uses a guest-appropriate message for a stale review', () => {
    expect(staleReview().message).toMatch(/review it again/i);
  });

  it('strips internalMessage from the public projection', () => {
    const error = internalError('database pool exhausted', 'corr-1');
    expect(error.internalMessage).toBe('database pool exhausted');

    const publicError = toPublicError(error);
    expect(publicError).not.toHaveProperty('internalMessage');
    expect(JSON.stringify(publicError)).not.toContain('database pool exhausted');
  });

  it('keeps validation issue paths in the public projection but no values', () => {
    const error = validationFailed([{ path: 'phone', code: 'invalid_string' }]);
    const publicError = toPublicError(error);
    expect(publicError.issues).toEqual([{ path: 'phone', code: 'invalid_string' }]);
  });

  it('omits optional fields rather than emitting undefined', () => {
    const error = appError('NOT_FOUND', 'Not found.');
    expect(Object.keys(error)).toEqual(['code', 'message', 'status']);
  });
});

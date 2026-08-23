import { describe, expect, it } from 'vitest';
import {
  CORRELATION_HEADER,
  correlationIdFrom,
  isValidCorrelationId,
  newCorrelationId,
} from '../../src/lib/correlation';

const VALID = '3f1a2b4c-5d6e-4f70-8901-234567890abc';

describe('correlation ids', () => {
  it('generates distinct valid UUIDs', () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(isValidCorrelationId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('accepts a well-formed inbound header', () => {
    const headers = new Headers({ [CORRELATION_HEADER]: VALID });
    expect(correlationIdFrom(headers)).toBe(VALID);
  });

  it('replaces a malformed header instead of trusting it', () => {
    const headers = new Headers({ [CORRELATION_HEADER]: 'not-a-uuid' });
    const id = correlationIdFrom(headers);
    expect(id).not.toBe('not-a-uuid');
    expect(isValidCorrelationId(id)).toBe(true);
  });

  it('rejects a log-forging attempt in the header', () => {
    const headers = new Headers({
      [CORRELATION_HEADER]: 'abc"} {"level":"error","event":"forged',
    });
    const id = correlationIdFrom(headers);
    expect(isValidCorrelationId(id)).toBe(true);
    expect(id).not.toContain('forged');
  });

  it('generates one when the header is absent or headers are missing', () => {
    expect(isValidCorrelationId(correlationIdFrom(new Headers()))).toBe(true);
    expect(isValidCorrelationId(correlationIdFrom(undefined))).toBe(true);
  });

  it('reads from a plain header record too', () => {
    expect(correlationIdFrom({ [CORRELATION_HEADER]: VALID })).toBe(VALID);
  });
});

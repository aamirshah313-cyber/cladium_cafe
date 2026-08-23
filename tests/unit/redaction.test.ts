import { describe, expect, it } from 'vitest';
import { REDACTED, isSensitiveKey, redact, redactFields } from '../../src/lib/redaction';
import { sensitivePayload } from '../fixtures/logging';

describe('isSensitiveKey', () => {
  it.each([
    'password',
    'apiKey',
    'api_key',
    'accessToken',
    'authorization',
    'cookie',
    'privateKey',
    'hmacSignature',
    'phone',
    'whatsapp',
    'email',
    'address',
    'guestName',
    'notes',
    'note',
    'message',
    'transcript',
    'audio',
  ])('treats %s as sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    'correlationId',
    'idempotencyKey',
    'toolCallId',
    'status',
    'version',
    'locale',
    'quantity',
  ])('treats %s as safe', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('redact', () => {
  it('removes every sensitive field but keeps safe ones', () => {
    const output = redactFields({ ...sensitivePayload });

    expect(output.guestName).toBe(REDACTED);
    expect(output.phone).toBe(REDACTED);
    expect(output.email).toBe(REDACTED);
    expect(output.notes).toBe(REDACTED);
    expect(output.message).toBe(REDACTED);
    expect(output.apiKey).toBe(REDACTED);
    expect(output.authorization).toBe(REDACTED);

    expect(output.correlationId).toBe(sensitivePayload.correlationId);
    expect(output.quantity).toBe(2);
  });

  it('does not leak a sensitive value anywhere in the serialized output', () => {
    const serialized = JSON.stringify(redactFields({ ...sensitivePayload }));
    expect(serialized).not.toContain('Test Guest');
    expect(serialized).not.toContain('+92 300 0000000');
    expect(serialized).not.toContain('guest@example.com');
    expect(serialized).not.toContain('treehouse');
    expect(serialized).not.toContain('should-never-appear');
  });

  it('redacts nested structures', () => {
    const output = redact({ order: { customer: { phone: '+92 300 0000000' }, total: 1399 } }) as {
      order: { customer: { phone: string }; total: number };
    };
    expect(output.order.customer.phone).toBe(REDACTED);
    expect(output.order.total).toBe(1399);
  });

  it('redacts sensitive keys inside arrays', () => {
    const output = redact([{ notes: 'secret note' }, { quantity: 1 }]) as Array<
      Record<string, unknown>
    >;
    expect(output[0]?.notes).toBe(REDACTED);
    expect(output[1]?.quantity).toBe(1);
  });

  it('never logs an Error message, which often embeds user input', () => {
    const output = redact(new Error('failed for guest +92 300 0000000')) as {
      name: string;
      message: string;
    };
    expect(output.message).toBe(REDACTED);
    expect(output.name).toBe('Error');
  });

  it('truncates very long strings', () => {
    const output = redact('a'.repeat(1000)) as string;
    expect(output.endsWith('[TRUNCATED]')).toBe(true);
    expect(output.length).toBeLessThan(1000);
  });

  it('stops at a depth limit rather than walking unbounded structures', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(JSON.stringify(redact(deep))).toContain('[TRUNCATED]');
  });

  it('summarizes exotic values instead of serializing them', () => {
    expect(redact(new Map([['a', 1]]))).toBe('[UNSERIALIZABLE]');
    expect(redact(() => undefined)).toBe('[UNSERIALIZABLE]');
  });

  it('handles null and undefined without throwing', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});

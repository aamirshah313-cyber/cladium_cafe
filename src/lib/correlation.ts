/**
 * Correlation IDs tie a guest action to its logs, status events, and audit
 * records (production-architecture-v2.md §10). An inbound header is untrusted
 * input: it is accepted only if it is a well-formed UUID, otherwise a fresh
 * ID is generated. That prevents a caller from injecting log-forging text.
 */

import { z } from 'zod';

export const CORRELATION_HEADER = 'x-correlation-id';

export const correlationIdSchema = z.uuid();

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export function isValidCorrelationId(value: unknown): value is string {
  return correlationIdSchema.safeParse(value).success;
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[name] ?? record[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Returns the caller's correlation ID when it is a valid UUID, otherwise a
 * new one. Never throws — a bad header degrades to a fresh ID rather than
 * failing the request.
 */
export function correlationIdFrom(headers: HeaderSource | undefined): string {
  if (!headers) return newCorrelationId();
  const candidate = readHeader(headers, CORRELATION_HEADER);
  return isValidCorrelationId(candidate) ? candidate : newCorrelationId();
}

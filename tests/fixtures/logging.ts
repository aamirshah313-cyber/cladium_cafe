import type { LogEntry, LogSink } from '../../src/lib/logging';

/** In-memory sink so tests can assert on exactly what would be logged. */
export function createMemorySink(): LogSink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry: LogEntry): void {
      entries.push(entry);
    },
  };
}

/** Fixed clock so log timestamps are deterministic in assertions. */
export const fixedNow = (): Date => new Date('2026-08-23T12:00:00.000Z');

/**
 * A payload deliberately full of the field types that must never survive
 * redaction: contact details, notes, chat text, and credentials.
 */
export const sensitivePayload = {
  guestName: 'Test Guest',
  phone: '+92 300 0000000',
  email: 'guest@example.com',
  notes: 'Please seat us in the treehouse',
  message: 'chat transcript text',
  apiKey: 'should-never-appear',
  authorization: 'Bearer should-never-appear',
  correlationId: '00000000-0000-4000-8000-000000000000',
  quantity: 2,
} as const;

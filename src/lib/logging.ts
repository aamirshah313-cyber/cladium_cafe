/**
 * Structured, redacted logging.
 *
 * Every field passes through `redact()`; there is deliberately no "log this
 * raw" escape hatch. Output is one JSON object per line for log aggregation.
 */

import { redactFields } from './redaction';
import type { AppError } from './errors';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  readonly level: LogLevel;
  /** Stable machine-readable event name, e.g. "takeaway.request.submitted". */
  readonly event: string;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly fields?: Record<string, unknown>;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

/** Default sink: one JSON line per entry on the matching console stream. */
export const consoleSink: LogSink = {
  write(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.log(line);
  },
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** Logs an AppError's safe metadata. Never logs `message`, which may embed context. */
  logAppError(error: AppError, fields?: Record<string, unknown>): void;
  /** Derives a child logger that stamps the same correlation ID on every entry. */
  withCorrelationId(correlationId: string): Logger;
}

export function createLogger(
  options: { correlationId?: string; sink?: LogSink; now?: () => Date } = {},
): Logger {
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const correlationId = options.correlationId;

  function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      event,
      timestamp: now().toISOString(),
      ...(correlationId === undefined ? {} : { correlationId }),
      ...(fields === undefined ? {} : { fields: redactFields(fields) }),
    };
    sink.write(entry);
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    logAppError: (error, fields) =>
      emit('error', 'app.error', {
        ...fields,
        code: error.code,
        status: error.status,
        // `issues` carries field paths only, never rejected values.
        ...(error.issues === undefined ? {} : { issueCount: error.issues.length }),
        ...(error.internalMessage === undefined ? {} : { internalMessage: error.internalMessage }),
      }),
    withCorrelationId: (id) => createLogger({ ...options, correlationId: id, sink, now }),
  };
}

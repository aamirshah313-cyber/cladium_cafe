/**
 * Application error taxonomy.
 *
 * An AppError carries two separate messages on purpose:
 *   - `message` is safe to show a guest and safe to serialize;
 *   - `internalMessage` is for server logs only and is never serialized.
 *
 * Nothing here may carry customer PII, request notes, chat text, or
 * credentials — see `redaction.ts` and production-architecture-v2.md §12.
 */

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'STALE_REVIEW',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'FEATURE_DISABLED',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVIEW: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  FEATURE_DISABLED: 404,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

/** A field-level validation problem. Paths only — never the rejected value, which may be PII. */
export interface FieldIssue {
  readonly path: string;
  readonly code: string;
}

export interface AppError {
  readonly code: ErrorCode;
  /** Safe for the client. Never interpolate user input or system detail into this. */
  readonly message: string;
  readonly status: number;
  readonly correlationId?: string;
  /** Field paths that failed validation. Safe: no values. */
  readonly issues?: readonly FieldIssue[];
  /**
   * Server-log only; never serialized to a client response. Must be
   * developer-authored text — never interpolate guest input, notes, chat
   * text, or credentials into it (it is allowlisted past log redaction).
   */
  readonly internalMessage?: string;
}

export function httpStatusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function appError(
  code: ErrorCode,
  message: string,
  options: {
    correlationId?: string;
    issues?: readonly FieldIssue[];
    internalMessage?: string;
  } = {},
): AppError {
  return {
    code,
    message,
    status: httpStatusFor(code),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.issues === undefined ? {} : { issues: options.issues }),
    ...(options.internalMessage === undefined ? {} : { internalMessage: options.internalMessage }),
  };
}

export const validationFailed = (issues: readonly FieldIssue[], correlationId?: string): AppError =>
  appError('VALIDATION_FAILED', 'Some of the details provided are not valid.', {
    issues,
    correlationId,
  });

export const unauthorized = (correlationId?: string): AppError =>
  appError('UNAUTHORIZED', 'You need to sign in to do that.', { correlationId });

export const forbidden = (correlationId?: string): AppError =>
  appError('FORBIDDEN', 'You do not have permission to do that.', { correlationId });

export const notFound = (correlationId?: string): AppError =>
  appError('NOT_FOUND', 'That item could not be found.', { correlationId });

/** An optimistic-lock version mismatch — the record changed since it was last read. */
export const conflict = (correlationId?: string): AppError =>
  appError('CONFLICT', 'This was just updated elsewhere. Please refresh and try again.', {
    correlationId,
  });

/**
 * The reviewed draft changed (for example a price moved) after the guest saw
 * it, so the confirmation token no longer matches the review hash.
 */
export const staleReview = (correlationId?: string): AppError =>
  appError('STALE_REVIEW', 'Your request changed since you reviewed it. Please review it again.', {
    correlationId,
  });

export const idempotencyConflict = (correlationId?: string): AppError =>
  appError(
    'IDEMPOTENCY_CONFLICT',
    'This looks like a repeat of a different request. Please start again.',
    { correlationId },
  );

export const rateLimited = (correlationId?: string): AppError =>
  appError('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.', {
    correlationId,
  });

/** A disabled feature must not confirm it exists — hence 404, not 403. */
export const featureDisabled = (correlationId?: string): AppError =>
  appError('FEATURE_DISABLED', 'That is not available.', { correlationId });

export const unsupportedMediaType = (correlationId?: string): AppError =>
  appError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type.', { correlationId });

export const payloadTooLarge = (correlationId?: string): AppError =>
  appError('PAYLOAD_TOO_LARGE', 'The request body is too large.', { correlationId });

export const internalError = (internalMessage?: string, correlationId?: string): AppError =>
  appError('INTERNAL', 'Something went wrong on our side. Please try again.', {
    correlationId,
    internalMessage,
  });

/**
 * Client-facing projection. Drops `internalMessage` so an internal detail can
 * never reach a response body by accident.
 */
export function toPublicError(error: AppError): {
  code: ErrorCode;
  message: string;
  correlationId?: string;
  issues?: readonly FieldIssue[];
} {
  return {
    code: error.code,
    message: error.message,
    ...(error.correlationId === undefined ? {} : { correlationId: error.correlationId }),
    ...(error.issues === undefined ? {} : { issues: error.issues }),
  };
}

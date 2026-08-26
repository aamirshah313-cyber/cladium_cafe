/**
 * Single-use confirmation tokens — Runbook Step 19 (data-model-v2.md
 * `confirmation_tokens`).
 *
 * "Store a hash—not the raw token—with session ID, action type, review
 * payload hash, expiry, used time, and issuance context. Tokens are
 * single-use and invalidated when the reviewed draft changes." The raw
 * token is a high-entropy server-generated secret handed to the guest for
 * the final tap-to-confirm; only its SHA-256 hash is ever stored, so a
 * database read can never recover a live token. Server-only: generates
 * cryptographic randomness and hashes it, like `security/session.ts`.
 *
 * A review-hash mismatch (the menu/price changed since the guest reviewed
 * it) reuses `staleReview` from `lib/errors.ts` — this is exactly the
 * scenario that error was built for.
 */

import { randomBytes, createHash } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';
import { staleReview, notFound, type AppError } from '../errors';

assertServerOnly('src/lib/domain/confirmation-token.ts');

export type ConfirmationAction = 'TAKEAWAY_REQUEST' | 'BOOKING_REQUEST' | 'EVENT_REQUEST';

export interface ConfirmationTokenRecord {
  readonly tokenHash: string;
  readonly sessionId: string;
  readonly action: ConfirmationAction;
  /** Hash of the exact reviewed draft the guest saw (deterministic totals/fields). */
  readonly reviewHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export interface ConfirmationTokenStore {
  save(record: ConfirmationTokenRecord): Promise<void>;
  find(tokenHash: string): Promise<ConfirmationTokenRecord | null>;
  markUsed(tokenHash: string, now: Date): Promise<void>;
}

export function createInMemoryConfirmationTokenStore(): ConfirmationTokenStore & {
  readonly records: ReadonlyMap<string, ConfirmationTokenRecord>;
} {
  const records = new Map<string, ConfirmationTokenRecord>();
  return {
    records,
    async save(record) {
      records.set(record.tokenHash, record);
    },
    async find(tokenHash) {
      return records.get(tokenHash) ?? null;
    },
    async markUsed(tokenHash, now) {
      const existing = records.get(tokenHash);
      if (!existing) return;
      records.set(tokenHash, { ...existing, usedAt: now.toISOString() });
    },
  };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface IssueConfirmationTokenInput {
  readonly sessionId: string;
  readonly action: ConfirmationAction;
  readonly reviewHash: string;
  readonly ttlSeconds: number;
  readonly now?: () => Date;
}

/** Returns the raw token to hand to the guest; only its hash is persisted. */
export async function issueConfirmationToken(
  store: ConfirmationTokenStore,
  input: IssueConfirmationTokenInput,
): Promise<{ rawToken: string; record: ConfirmationTokenRecord }> {
  const now = input.now ?? (() => new Date());
  const issuedAt = now();
  const rawToken = randomBytes(32).toString('base64url');
  const record: ConfirmationTokenRecord = {
    tokenHash: hashToken(rawToken),
    sessionId: input.sessionId,
    action: input.action,
    reviewHash: input.reviewHash,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + input.ttlSeconds * 1000).toISOString(),
    usedAt: null,
  };
  await store.save(record);
  return { rawToken, record };
}

export interface ConsumeConfirmationTokenInput {
  readonly rawToken: string;
  readonly sessionId: string;
  readonly action: ConfirmationAction;
  readonly reviewHash: string;
  readonly now?: () => Date;
  readonly correlationId?: string;
}

/**
 * Validates and marks a token used in one step — a token can only ever be
 * consumed once. Session/action mismatches and unknown tokens are
 * `NOT_FOUND` (indistinguishable from a bad token, deliberately, so a
 * guessed token doesn't reveal which part was wrong); a stale review hash
 * is `STALE_REVIEW` specifically, since the guest needs to know to review
 * again, not that they mistyped something.
 */
export async function consumeConfirmationToken(
  store: ConfirmationTokenStore,
  input: ConsumeConfirmationTokenInput,
): Promise<Result<ConfirmationTokenRecord, AppError>> {
  const now = input.now ?? (() => new Date());
  const record = await store.find(hashToken(input.rawToken));

  if (!record) return err(notFound(input.correlationId));
  if (record.sessionId !== input.sessionId) return err(notFound(input.correlationId));
  if (record.action !== input.action) return err(notFound(input.correlationId));
  if (record.usedAt !== null) return err(notFound(input.correlationId));
  if (new Date(record.expiresAt).getTime() <= now().getTime())
    return err(notFound(input.correlationId));
  if (record.reviewHash !== input.reviewHash) return err(staleReview(input.correlationId));

  await store.markUsed(record.tokenHash, now());
  return ok(record);
}

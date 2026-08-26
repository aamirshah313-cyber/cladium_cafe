/**
 * Deterministic review hashing — Runbook Step 19.
 *
 * Binds a confirmation token to the exact reviewed draft a guest saw
 * (data-model-v2.md `confirmation_tokens`: "invalidated when the reviewed
 * draft changes"). The caller must build the same plain-object shape, with
 * the same key order, at both prepare time (issuing the token) and submit
 * time (consuming it) — `JSON.stringify` is stable for a given key order,
 * not for an arbitrary one, so this is not a general-purpose canonical
 * hash; it only works because both call sites share one review-builder
 * function per entity.
 */

import { createHash } from 'node:crypto';
import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/domain/review-hash.ts');

export function hashReview(review: unknown): string {
  return createHash('sha256').update(JSON.stringify(review)).digest('hex');
}

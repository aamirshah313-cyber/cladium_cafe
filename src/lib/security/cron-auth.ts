/**
 * Cron/dispatcher bearer-token check — Runbook Step 25.
 *
 * `deployment-target.md`: "`CRON_SECRET` | server only | authenticated
 * outbox/retention jobs" — the same pattern Vercel Cron itself uses
 * (`Authorization: Bearer $CRON_SECRET`). Constant-time comparison, same
 * reasoning as every other secret comparison in this codebase
 * (`security/csrf.ts`, `security/session.ts`): a length-based early exit
 * before `timingSafeEqual` never leaks timing information about a partial
 * match, because it never reaches the comparison at all when lengths
 * differ.
 */

import { timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/cron-auth.ts');

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const BEARER_PREFIX = 'Bearer ';

/** `false` whenever `secret` is falsy — an unconfigured `CRON_SECRET` must never mean "accept anything." */
export function verifyCronAuthHeader(
  authorizationHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false;
  const candidate = authorizationHeader.slice(BEARER_PREFIX.length);
  return constantTimeEqual(candidate, secret);
}

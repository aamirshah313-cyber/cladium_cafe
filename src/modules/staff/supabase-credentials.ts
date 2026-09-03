/**
 * Real staff sign-in orchestration — Step 45's staff-auth blocker (D-049),
 * the real-auth counterpart to `dev-credentials.ts#verifyDevStaffCredentials`.
 *
 * Encodes release-gates-v2.md Gate 3's "owner/manager MFA is enforced" as a
 * real, structural guarantee, not an ops-practice hope: an OWNER/MANAGER
 * account with no verified TOTP factor can never reach `SIGNED_IN` — it is
 * routed to `MFA_ENROLLMENT_REQUIRED` instead, and only a completed
 * enrollment (`completeTotpEnrollment`, called from
 * `POST /api/staff/mfa/enroll/verify`) issues a real signed-in session for
 * it. This check is unconditional on the account's *roles*, never on
 * whether Supabase's own `nextLevel` happens to say `aal2` is needed — the
 * same "authorization enforced here AND in service code, hiding a control
 * is not authorization" principle `rls_helpers.sql#staff_has_role`'s own
 * doc comment states for the database layer.
 *
 * Never distinguishes "wrong email" from "wrong password" from "not staff"
 * to the caller — every failure path returns the same `FAILED` outcome,
 * matching `verifyDevStaffCredentials`'s existing convention.
 */

import { assertServerOnly } from '../../lib/server-only';
import type { StaffAuthClient } from '../integrations/supabase-auth-client';
import { findStaffAccountByAuthUserId as findStaffAccountByAuthUserIdReal } from './supabase-directory';
import type { StaffAccount } from './directory';
import { issuePendingMfaCookie, type PendingMfaState } from './mfa-session';

assertServerOnly('src/modules/staff/supabase-credentials.ts');

const MFA_ROLES = new Set(['OWNER', 'MANAGER']);
const TOTP_FRIENDLY_NAME = 'Cladium Staff';

export type StaffSignInOutcome =
  | { readonly kind: 'SIGNED_IN'; readonly account: StaffAccount }
  | { readonly kind: 'MFA_REQUIRED'; readonly pendingMfaCookie: string }
  | { readonly kind: 'MFA_ENROLLMENT_REQUIRED'; readonly pendingMfaCookie: string }
  | { readonly kind: 'FAILED' };

export interface SupabaseCredentialDeps {
  readonly authClient: StaffAuthClient;
  /** Defaults to the real Supabase-backed lookup — overridable so this module's tests never need a live Supabase project, the same `deps`-injection shape `submission-service.ts`/`staff-service.ts` already use throughout this codebase. */
  readonly findAccountByAuthUserId?: (userId: string) => Promise<StaffAccount | null>;
}

function lookupFor(deps: SupabaseCredentialDeps) {
  return deps.findAccountByAuthUserId ?? findStaffAccountByAuthUserIdReal;
}

export async function signInWithSupabasePassword(
  deps: SupabaseCredentialDeps,
  email: string,
  password: string,
  options: { secure: boolean; now?: Date },
): Promise<StaffSignInOutcome> {
  const session = await deps.authClient.signInWithPassword(email, password);
  if (!session) return { kind: 'FAILED' };

  const account = await lookupFor(deps)(session.userId);
  if (!account) return { kind: 'FAILED' };

  const assurance = await deps.authClient.getAssuranceLevel(session);

  if (assurance.currentLevel === 'aal2') {
    // Already elevated (defensive — a fresh password sign-in normally starts at aal1).
    return { kind: 'SIGNED_IN', account };
  }

  if (assurance.nextLevel === 'aal2') {
    // A verified factor exists — challenge it, regardless of role.
    const factor = await deps.authClient.findVerifiedTotpFactor(session);
    if (!factor) return { kind: 'FAILED' };
    const challenge = await deps.authClient.challengeTotp(session, factor.factorId);
    if (!challenge) return { kind: 'FAILED' };

    const pendingMfaCookie = issuePendingMfaCookie(
      {
        purpose: 'SIGN_IN_CHALLENGE',
        session,
        factorId: factor.factorId,
        challengeId: challenge.challengeId,
      },
      { secure: options.secure, now: options.now },
    );
    return { kind: 'MFA_REQUIRED', pendingMfaCookie };
  }

  if (account.roles.some((role) => MFA_ROLES.has(role))) {
    // Gate 3: this role must never reach SIGNED_IN without a verified factor.
    const pendingMfaCookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session },
      { secure: options.secure, now: options.now },
    );
    return { kind: 'MFA_ENROLLMENT_REQUIRED', pendingMfaCookie };
  }

  return { kind: 'SIGNED_IN', account };
}

/** `null` for a wrong/expired code, a stale/mismatched pending state, or an account no longer staff. */
export async function completeSupabaseMfaChallenge(
  deps: SupabaseCredentialDeps,
  pending: PendingMfaState,
  code: string,
): Promise<{ readonly account: StaffAccount } | null> {
  if (pending.purpose !== 'SIGN_IN_CHALLENGE' || !pending.factorId || !pending.challengeId) {
    return null;
  }
  const elevated = await deps.authClient.verifyTotp(
    pending.session,
    pending.factorId,
    pending.challengeId,
    code,
  );
  if (!elevated) return null;

  const account = await lookupFor(deps)(elevated.userId);
  return account ? { account } : null;
}

export interface TotpEnrollmentStart {
  readonly factorId: string;
  readonly qrCodeDataUri: string;
  readonly secret: string;
  /** Re-issued with `factorId` embedded — `POST /api/staff/mfa/enroll/verify` reads it from here, never trusting a client-supplied value. */
  readonly pendingMfaCookie: string;
}

/** `null` for a stale/wrong-purpose pending state, or a Supabase enrollment-start failure. */
export async function startTotpEnrollment(
  deps: SupabaseCredentialDeps,
  pending: PendingMfaState,
  options: { secure: boolean; now?: Date },
): Promise<TotpEnrollmentStart | null> {
  if (pending.purpose !== 'ENROLL_WINDOW') return null;

  const enrollment = await deps.authClient.enrollTotp(pending.session, TOTP_FRIENDLY_NAME);
  if (!enrollment) return null;

  const pendingMfaCookie = issuePendingMfaCookie(
    { purpose: 'ENROLL_WINDOW', session: pending.session, factorId: enrollment.factorId },
    { secure: options.secure, now: options.now },
  );

  return {
    factorId: enrollment.factorId,
    qrCodeDataUri: enrollment.qrCodeDataUri,
    secret: enrollment.secret,
    pendingMfaCookie,
  };
}

/** `null` for a wrong/expired code, a stale/mismatched pending state, or an account no longer staff. */
export async function completeTotpEnrollment(
  deps: SupabaseCredentialDeps,
  pending: PendingMfaState,
  code: string,
): Promise<{ readonly account: StaffAccount } | null> {
  if (pending.purpose !== 'ENROLL_WINDOW' || !pending.factorId) return null;

  const elevated = await deps.authClient.verifyEnrollment(pending.session, pending.factorId, code);
  if (!elevated) return null;

  const account = await lookupFor(deps)(elevated.userId);
  return account ? { account } : null;
}

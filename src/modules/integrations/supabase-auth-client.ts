/**
 * Provider-neutral staff auth client + the real Supabase-backed adapter —
 * built to close Step 45's one hard technical blocker (D-049): real staff
 * authentication with owner/manager MFA (release-gates-v2.md Gate 3), not
 * `modules/staff/dev-credentials.ts`'s explicitly dev-only fixture (D-028).
 *
 * ADR-0008 (provider-neutral adapters): callers (the sign-in route, the MFA
 * enrollment routes) depend only on `StaffAuthClient`, never on
 * `@supabase/supabase-js`'s own types directly — verified against the real
 * package's shipped `.d.ts` files before writing this (`node_modules/
 * @supabase/auth-js/dist/main/lib/types.d.ts`), the same "read real types,
 * don't guess" discipline Step 33 applied to `@vapi-ai/web`.
 *
 * Every method here is *stateless* on purpose: a fresh, unpersisted Supabase
 * client is created per call and (when a session is supplied) hydrated with
 * `setSession()` before use. This is the correct pattern for a serverless
 * Next.js route — there is no long-lived process to hold a client's
 * internal session state across requests — and it means the *caller* (this
 * app's own signed cookies, `modules/staff/mfa-session.ts`) is the only
 * place a Supabase access/refresh token pair is ever persisted, and only
 * ever for the few minutes a sign-in/enrollment flow actually needs it.
 *
 * Construction never throws — the URL/anon key are only read (and only
 * ever fail closed) inside each method, the same "fail only when actually
 * used" shape as `createAnthropicChatClient`/`createVapiTokenIssuer`.
 */

import { createClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../../lib/server-only';
import { parseSupabasePublicCredentials } from '../../lib/env';

assertServerOnly('src/modules/integrations/supabase-auth-client.ts');

export interface StaffAuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userId: string;
}

export interface StaffAssuranceLevel {
  readonly currentLevel: 'aal1' | 'aal2' | null;
  readonly nextLevel: 'aal1' | 'aal2' | null;
}

export interface StaffTotpEnrollment {
  readonly factorId: string;
  /** Ready to use directly as an `<img src>` — the SVG data URI prefix is added here, once, so no caller can forget it. */
  readonly qrCodeDataUri: string;
  readonly secret: string;
}

export interface StaffAuthClient {
  /** `null` for any sign-in failure — never distinguishes "wrong email" from "wrong password" to the caller, matching `verifyDevStaffCredentials`'s existing convention. */
  signInWithPassword(email: string, password: string): Promise<StaffAuthSession | null>;
  getAssuranceLevel(session: StaffAuthSession): Promise<StaffAssuranceLevel>;
  /** The account's currently-verified TOTP factor, if any. Only ever one is expected in practice (`enrollTotp` below is the only enrollment path this app exposes). */
  findVerifiedTotpFactor(session: StaffAuthSession): Promise<{ readonly factorId: string } | null>;
  /** `null` on failure (e.g. an already-completed or expired challenge). */
  challengeTotp(
    session: StaffAuthSession,
    factorId: string,
  ): Promise<{ readonly challengeId: string } | null>;
  /** `null` for a wrong/expired code — returns the *elevated* (aal2) session on success. */
  verifyTotp(
    session: StaffAuthSession,
    factorId: string,
    challengeId: string,
    code: string,
  ): Promise<StaffAuthSession | null>;
  /** Starts enrollment of a new (unverified) TOTP factor. */
  enrollTotp(session: StaffAuthSession, friendlyName: string): Promise<StaffTotpEnrollment | null>;
  /** Challenges and verifies the just-enrolled factor in one step (`mfa.challengeAndVerify`) — the factor becomes `verified` only on success. */
  verifyEnrollment(
    session: StaffAuthSession,
    factorId: string,
    code: string,
  ): Promise<StaffAuthSession | null>;
}

function toStaffAuthSession(session: {
  access_token: string;
  refresh_token: string;
  user: { id: string };
}): StaffAuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: session.user.id,
  };
}

/** Never throws at construction — see module doc comment. */
export function createSupabaseStaffAuthClient(): StaffAuthClient {
  function newClient() {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
      parseSupabasePublicCredentials();
    // `persistSession`/`autoRefreshToken` both false: there is no browser
    // storage on the server, and this app manages its own cookie-based
    // session lifetime — Supabase's client-side session machinery would be
    // dead weight (and a source of confusing, silently-ignored state) here.
    return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function hydrated(session: StaffAuthSession) {
    const client = newClient();
    await client.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });
    return client;
  }

  return {
    async signInWithPassword(email, password) {
      const client = newClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) return null;
      return toStaffAuthSession({ ...data.session, user: data.user });
    },

    async getAssuranceLevel(session) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) return { currentLevel: null, nextLevel: null };
      return {
        currentLevel: (data.currentLevel as 'aal1' | 'aal2' | null) ?? null,
        nextLevel: (data.nextLevel as 'aal1' | 'aal2' | null) ?? null,
      };
    },

    async findVerifiedTotpFactor(session) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.listFactors();
      if (error || !data) return null;
      const factor = data.totp.find((candidate) => candidate.status === 'verified');
      return factor ? { factorId: factor.id } : null;
    },

    async challengeTotp(session, factorId) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.challenge({ factorId });
      if (error || !data) return null;
      return { challengeId: data.id };
    },

    async verifyTotp(session, factorId, challengeId, code) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
      if (error || !data) return null;
      return toStaffAuthSession(data);
    },

    async enrollTotp(session, friendlyName) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName });
      if (error || !data) return null;
      return {
        factorId: data.id,
        qrCodeDataUri: `data:image/svg+xml;utf-8,${data.totp.qr_code}`,
        secret: data.totp.secret,
      };
    },

    async verifyEnrollment(session, factorId, code) {
      const client = await hydrated(session);
      const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error || !data) return null;
      return toStaffAuthSession(data);
    },
  };
}

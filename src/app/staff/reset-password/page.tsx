'use client';

/**
 * POST /staff/reset-password — Runbook Step 45 (D-059).
 *
 * Real gap found live: a Supabase password-recovery email correctly
 * redirects here (once the project's Site URL is configured correctly —
 * `real-staff-account-setup.md` covers that one-time setup step), but
 * nothing in this app ever consumed the resulting session and let the
 * guest actually set a new password — Supabase's recovery link only
 * *establishes a session*; a real `updateUser({ password })` call is
 * still required, and no page existed to make it.
 *
 * This is a plain client component (not a route handler) because the
 * recovery session lives in the URL's hash fragment, which the server
 * never sees — only the browser can read it. Uses its own browser-only
 * Supabase client (default `detectSessionInUrl`/`persistSession` —
 * deliberately different from `modules/integrations/supabase-auth-client.ts`'s
 * server-only, stateless-per-call client, which exists for a completely
 * different purpose and must never hold a session across a page's
 * lifetime). Never touches this app's own staff session cookie or
 * `modules/staff/*` — a successful password update here only means the
 * *next* real sign-in (`/staff`'s own form) will work; it does not sign
 * the guest into this app.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { parseSupabasePublicCredentials } from '../../../lib/env';

type PageState = 'checking' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  // Both start SSR-safe/identical on server and client — this page is
  // statically prerendered, and `window` doesn't exist at prerender time.
  // Deriving either from `window.location.hash` here (even via a lazy
  // useState initializer) would render different text on the server than
  // on the client's first pass and trip a real hydration mismatch (React
  // error #418) — confirmed live against a production build, not assumed.
  const [state, setState] = useState<PageState>('checking');
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase itself appends `#error=...&error_code=...&error_description=...`
    // directly to this page's URL when the recovery link was already dead —
    // expired, or already used (a single-use token; a prior visit to
    // /auth/v1/verify, even one that redirected somewhere dead before this
    // page existed, already consumed it). Checking this first gives the
    // real, Supabase-reported reason instead of only ever falling back to
    // the blind timeout guess below. `window.location.hash` genuinely
    // cannot be known before this effect runs (see the state comment
    // above), so setting state synchronously here — rather than only ever
    // inside a later async callback — is the deliberate, correct exception
    // to react-hooks/set-state-in-effect, not an oversight.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const hashErrorDescription = hashParams.get('error_description');
    if (hashErrorDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setInvalidReason(hashErrorDescription);
      setState('invalid');
      return;
    }

    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
      parseSupabasePublicCredentials();
    const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

    let cancelled = false;

    // The client library processes the URL's recovery hash during its own
    // initialization — by the time this effect runs, a session may already
    // exist, or the PASSWORD_RECOVERY event may still be about to fire.
    // Checking both covers either timing.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setState('ready');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' && session) setState('ready');
    });

    // No valid recovery session ever showed up — an expired or already-used link.
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setState((current) => (current === 'checking' ? 'invalid' : current));
      }
    }, 3000);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
        parseSupabasePublicCredentials();
      const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Could not update the password. Please try again.');
        return;
      }
      await supabase.auth.signOut();
      setState('success');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'checking') {
    return (
      <div>
        <h1>Reset your password</h1>
        <p>Checking your reset link…</p>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div>
        <h1>Reset your password</h1>
        <p>
          {(invalidReason ?? 'This reset link is invalid or has expired').replace(/\.?$/, '.')} Ask
          whoever manages staff access to send a new one, or set your password directly from the
          Supabase dashboard.
        </p>
        <p>
          <Link href="/staff">Back to staff sign-in</Link>
        </p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div>
        <h1>Password updated</h1>
        <p>Your password has been changed. You can now sign in with it.</p>
        <p>
          <Link href="/staff">Go to staff sign-in</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Reset your password</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <label htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="reset-password-confirm">Confirm new password</label>
          <input
            id="reset-password-confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          Set new password
        </button>
      </form>
    </div>
  );
}

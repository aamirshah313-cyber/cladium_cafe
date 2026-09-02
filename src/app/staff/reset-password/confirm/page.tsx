'use client';

/**
 * GET /staff/reset-password/confirm — D-059 follow-up.
 *
 * Real, documented Supabase failure mode found live in this project: an
 * enterprise/consumer email security scanner can visit a password-recovery
 * link automatically, the instant the email arrives, before the human ever
 * opens it. Supabase's own recovery links are single-use, so that scanner
 * silently burns the token — the human's later, genuine click then always
 * fails with `otp_expired`, however fast they click. Confirmed against
 * Supabase's own docs (`guides/auth/auth-email-templates` → "Email
 * prefetching"), which names this exact failure and recommends this exact
 * mitigation ("Option 2"): never put the real one-time verify link directly
 * in the email. Put a link to a domain you control instead, showing a real
 * button that only a genuine human click follows. A scanner fetches the
 * emailed link (this page) automatically but does not execute JavaScript or
 * click a rendered button, so it burns nothing but this harmless
 * interstitial — the real Supabase verify URL is only ever visited by an
 * actual click.
 *
 * Requires a matching change to the "Reset password" email template in the
 * Supabase dashboard (Authentication → Email Templates → Reset Password),
 * replacing the direct `{{ .ConfirmationURL }}` link with one pointing here
 * (`{{ .SiteURL }}/confirm?confirmation_url={{ .ConfirmationURL }}`) — that
 * edit has to be made by whoever has dashboard access; this code cannot do
 * it. Site URL is already `.../staff/reset-password`, so the resulting link
 * lands exactly at this page.
 *
 * A real security property, not just documentation-following: the
 * `confirmation_url` query param is validated to actually start with this
 * project's own Supabase auth verify endpoint before it is ever rendered as
 * a link target. Without that check, this page would itself become an open
 * redirect — anyone could construct a `cladium-cafe.vercel.app/...` link
 * that silently sends a click through to an attacker-controlled URL, which
 * would be far more convincing to a target than a raw phishing link. This
 * page never fetches, prefetches, or auto-navigates to that URL itself —
 * only a real click does, matching the whole point of the mitigation.
 */

import { useEffect, useState } from 'react';
import { parseSupabasePublicCredentials } from '../../../../lib/env';

type PageState = 'checking' | 'ready' | 'invalid';

export default function ConfirmResetLinkPage() {
  // SSR-safe on both server and client, same reasoning as
  // staff/reset-password/page.tsx's own hydration-mismatch fix: this page
  // is statically prerendered, and `window` does not exist at that time.
  const [state, setState] = useState<PageState>('checking');
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);

  useEffect(() => {
    // window.location.search genuinely cannot be known before this effect
    // runs (this page is statically prerendered; see the state comment
    // above), so setting state synchronously here — not only ever inside a
    // later async callback — is the same deliberate, correct exception to
    // react-hooks/set-state-in-effect as staff/reset-password/page.tsx's
    // own hash check, not an oversight.
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('confirmation_url');

    let expectedPrefix: string;
    try {
      expectedPrefix = `${parseSupabasePublicCredentials().NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?`;
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setState('invalid');
      return;
    }

    if (raw && raw.startsWith(expectedPrefix)) {
      setConfirmationUrl(raw);
      setState('ready');
    } else {
      setState('invalid');
    }
  }, []);

  if (state === 'checking') {
    return (
      <div>
        <h1>Reset your password</h1>
        <p>Preparing your reset link…</p>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div>
        <h1>Reset your password</h1>
        <p>
          This link is missing or invalid. Ask whoever manages staff access to send a new password
          reset email.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Reset your password</h1>
      <p>Click below to continue resetting your password.</p>
      <p>
        <a href={confirmationUrl ?? undefined}>Continue to reset your password</a>
      </p>
    </div>
  );
}

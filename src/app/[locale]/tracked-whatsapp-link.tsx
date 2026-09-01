'use client';

/**
 * A click-to-WhatsApp link that also fires the Meta `contact` event —
 * Step 37 (D-041) built and fully tested `contact`/`lead` but deliberately
 * left them unwired into the WhatsApp links themselves, a separable
 * refactor tracked in `TASKS.md` rather than rushed into that step. This
 * is that wiring (Step 45 follow-up).
 *
 * Renders exactly the markup every page already used
 * (`<a target="_blank" rel="noopener noreferrer">`, Step 35's hardened
 * `buildWhatsAppUrl` href unchanged) — only an `onClick` handler is added.
 * Tracking is fire-and-forget (`trackMetaEventWithFreshCsrf`, Step 37's
 * own established pattern, itself consent/flag-gated server-side and
 * silent on any failure) and never delays or blocks the actual
 * navigation — the browser's default `<a>` click behavior proceeds
 * immediately regardless of whether the tracking call ever completes.
 *
 * Every WhatsApp CTA in this app is the same kind of guest-initiated
 * contact moment (no page-specific lead-qualification flow exists to
 * justify treating one differently) — all four call sites use `contact`,
 * matching Step 37's own catalog; `lead` stays built and tested for a
 * future flow that actually earns that distinction, not invented here.
 */

import type { ReactNode } from 'react';
import { trackMetaEventWithFreshCsrf } from '../../lib/analytics/meta-track-client';

interface TrackedWhatsAppLinkProps {
  readonly href: string;
  readonly eventSourceUrl: string;
  readonly children: ReactNode;
}

export function TrackedWhatsAppLink({ href, eventSourceUrl, children }: TrackedWhatsAppLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackMetaEventWithFreshCsrf('contact', eventSourceUrl)}
    >
      {children}
    </a>
  );
}

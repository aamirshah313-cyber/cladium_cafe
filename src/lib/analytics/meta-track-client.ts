/**
 * Browser-side Meta event tracking helper — Runbook Step 37.
 *
 * Client-safe (no server secret ever reaches this file — the actual Meta
 * credentials stay server-side in `lib/env.server.ts`/`meta-client.ts`).
 * POSTs to `/api/meta/track`, which runs the exact same consent/flag-gated
 * `trackMetaEvent` decision every server-triggered event uses. If the
 * server decided to send (`sent: true`), this forwards the *same*
 * `eventId` to the browser Pixel (`window.fbq`, loaded only when
 * `FEATURE_META_MARKETING` is on — never assumed present) so Meta can
 * dedupe the browser and CAPI reports of one logical event.
 *
 * Every failure mode here — a network error, a non-OK response, `fbq`
 * never having loaded — is swallowed silently. Tracking must never surface
 * an error to a guest or block whatever action triggered it.
 */

interface TrackMetaEventResponseBody {
  readonly sent: boolean;
  readonly eventId: string | null;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export async function sendMetaTrackEvent(
  eventName: 'view_menu' | 'add_to_cart' | 'contact' | 'lead',
  csrfToken: string,
  eventSourceUrl?: string,
): Promise<void> {
  try {
    const response = await fetch('/api/meta/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, eventSourceUrl, csrfToken }),
    });
    if (!response.ok) return;
    const body = (await response.json()) as TrackMetaEventResponseBody;
    if (body.sent && body.eventId && typeof window.fbq === 'function') {
      window.fbq('trackCustom', eventName, {}, { eventID: body.eventId });
    }
  } catch {
    // Best-effort — never surfaced to the guest.
  }
}

/** Fetches a CSRF token (`GET /api/session/csrf`, Step 22's shared bootstrap) and sends one event. Swallows every failure, same as `sendMetaTrackEvent` itself. */
export function trackMetaEventWithFreshCsrf(
  eventName: 'view_menu' | 'add_to_cart' | 'contact' | 'lead',
  eventSourceUrl?: string,
): void {
  fetch('/api/session/csrf')
    .then((response) => response.json())
    .then((body: { csrfToken?: string }) => {
      if (body.csrfToken) return sendMetaTrackEvent(eventName, body.csrfToken, eventSourceUrl);
      return undefined;
    })
    .catch(() => {
      // Best-effort — never surfaced to the guest.
    });
}

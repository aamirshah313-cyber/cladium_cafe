/**
 * Browser Meta Pixel bootstrap eligibility — Runbook Step 37 follow-up.
 *
 * `trackMetaEvent` (`meta-events.ts`) already gates every server-side CAPI
 * send on flag-then-consent; the browser Pixel script is the other half of
 * the same reporting channel (they share one `eventId` for Meta-side
 * dedupe) and deserves the identical gate — loading `fbevents.js` at all
 * lets Meta set its `_fbp` cookie and fire an automatic `PageView` before
 * any custom event does, which would silently bypass
 * `modules/consent/consent-service.ts`'s "META_MARKETING not granted"
 * default if the script rendered on flag alone.
 *
 * In order, mirroring `trackMetaEvent`'s exact sequence:
 * 1. `FEATURE_META_MARKETING` off → `null`, no further check even runs.
 * 2. No `META_PIXEL_ID` configured → `null`.
 * 3. No verified guest session yet (a first-time visitor who has never
 *    reached a session-minting route) → `null` — this is not a corner
 *    case to special-case, it is the same "no session" state a guest is
 *    genuinely in before any consent could ever have been recorded.
 * 4. `META_MARKETING` consent not granted for that session → `null`.
 * 5. Otherwise: the pixel id, for the caller to render the bootstrap script.
 */

export interface MetaPixelEligibilityDeps {
  readonly isFeatureEnabled: () => boolean;
  readonly pixelId: () => string | undefined;
  readonly hasConsent: (sessionId: string) => Promise<boolean>;
}

export async function resolveMetaPixelId(
  deps: MetaPixelEligibilityDeps,
  sessionId: string | null,
): Promise<string | null> {
  if (!deps.isFeatureEnabled()) return null;

  const pixelId = deps.pixelId();
  if (!pixelId) return null;

  if (!sessionId) return null;

  const consented = await deps.hasConsent(sessionId);
  return consented ? pixelId : null;
}

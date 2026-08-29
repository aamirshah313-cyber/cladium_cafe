/**
 * Consent defaults and versioning — Runbook Step 36.
 *
 * `CONSENT_POLICY_VERSION` is the "versioned-policy" the runbook's own
 * evidence bullet names: bump it whenever the actual scope/wording of what
 * a category's consent covers changes (a new analytics vendor, a new
 * recording use, a reworded privacy notice). `consent-service.ts` compares
 * a session's last-recorded `policyVersion` against this constant — a
 * mismatch means the guest consented under an earlier policy and should be
 * asked again, the same "drift is detected, not silently ignored" pattern
 * `modules/voice/profiles/policy.ts`'s `POLICY_VERSIONS` fingerprint uses
 * (Step 30), just versioned by hand here since consent copy is authored
 * prose, not a hashable constant.
 *
 * `CONSENT_DEFAULT_GRANTED`: `ESSENTIAL_PREFERENCES` (locale/theme cookie
 * storage, Steps 13–14) defaults to granted with no guest action required
 * — it was already happening before this step existed and is exempt from
 * opt-in the way strictly-necessary cookies universally are; the site's
 * language/theme switcher must keep working even for a guest who never
 * visits `/privacy` or interacts with any consent control. Every other
 * category defaults to NOT granted — `META_MARKETING`/`MICROPHONE`/
 * `RECORDING` all require an explicit, logged grant before the feature
 * they gate may run (`consent-service.ts#hasConsent` is the fail-closed
 * primitive Step 37's Meta adapter and `issue-vapi-token.ts`'s microphone
 * check both read).
 */

import type { ConsentCategory } from '../../lib/schemas/common';

export const CONSENT_POLICY_VERSION = '2026-08-29.1';

export const CONSENT_DEFAULT_GRANTED: Readonly<Record<ConsentCategory, boolean>> = {
  ESSENTIAL_PREFERENCES: true,
  META_MARKETING: false,
  MICROPHONE: false,
  RECORDING: false,
};

/**
 * Default retention window for consent-event proof, pending the
 * owner-approved retention schedule `release-gates-v2.md` Gate 0 requires
 * (currently unchecked). Chosen conservatively (~13 months, a common
 * consent-proof retention default) so the mechanism is real and testable
 * now; safe to shorten later, must not be lengthened without owner/legal
 * review once a real schedule is approved (tracked in `.continuum/TASKS.md`).
 */
export const CONSENT_EVENT_RETENTION_DAYS = 400;

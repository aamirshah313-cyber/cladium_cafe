/**
 * Vapi assistant configuration templates — Runbook Step 30 ("Vapi
 * configuration as controlled artifacts").
 *
 * A `VapiAssistantProfile` is deliberately a *content* template only: it has
 * no field for an assistant id, org id, private key, or webhook secret at
 * all. Those live exclusively in per-environment server env vars
 * (`VAPI_ORG_ID`/`VAPI_PRIVATE_KEY`/`VAPI_ASSISTANT_EN_ID`/
 * `VAPI_ASSISTANT_UR_ID`/`VAPI_WEBHOOK_HMAC_SECRET`, declared since Steps
 * 6/12 in `lib/env.server.ts`) and are read only by Step 31's token service
 * and Step 32's tool/webhook routes — never by this module. This is the
 * same "structural absence, not convention" pattern Step 28 used for the
 * missing submit tool: a template object literally cannot carry a
 * credential or an environment-specific id, so one can never leak across
 * environments by copy-paste, matching this step's own evidence bullet
 * ("assistant IDs/config versions cannot cross environments; secrets are
 * server-only").
 */

import type { Locale } from '../../../lib/i18n/locale';
import type { LocalizedText } from '../../../lib/i18n/localized-text';

/** Matches `deployment-target.md`'s three isolated environments exactly. */
export type VapiEnvironmentName = 'development' | 'preview' | 'production';

export const VAPI_ENVIRONMENTS: readonly VapiEnvironmentName[] = [
  'development',
  'preview',
  'production',
];

/**
 * Provider/voice/transcriber choice is deliberately *not* a free-form
 * string field a template author could fill in early — it is a
 * discriminated union so a real selection can only exist with the evidence
 * Step 34's bake-off produces. Every profile in this suite is
 * `PENDING_BAKEOFF` today, and a test asserts that stays true until Step 34
 * actually runs (`production-architecture-v2.md` §9: "do not hard-code a
 * provider before evaluation").
 */
export type VoiceStackSelection =
  | { readonly status: 'PENDING_BAKEOFF' }
  | {
      readonly status: 'SELECTED';
      readonly provider: string;
      readonly voiceId: string;
      readonly transcriber: string;
      readonly selectedAt: string;
      /** Points at the bake-off scorecard/report that justified this choice — never a guess. */
      readonly evidenceRef: string;
    };

export interface VapiAssistantProfile {
  readonly environment: VapiEnvironmentName;
  readonly locale: Locale;
  /** Human-assigned, bumped alongside a `CHANGELOG.md` entry — never auto-incremented. */
  readonly configVersion: string;
  /** Ties this profile to a recorded fingerprint of `CONCIERGE_SYSTEM_POLICY` — see `policy.ts`. */
  readonly policyVersion: string;
  /** Ties this profile to a recorded fingerprint of the text concierge's `TOOL_DEFINITIONS` — see `policy.ts`. */
  readonly toolSchemaVersion: string;
  /** The exact text sent as the Vapi assistant's system prompt (see `policy.ts#buildVoiceSystemPrompt`). */
  readonly systemPrompt: string;
  /**
   * Short, approved greeting/farewell — `LocalizedText`, so Urdu speech
   * content only ever ships once a fluent-speaker/owner review approves it.
   * Deliberately stricter than `lib/i18n/chrome.ts`'s already-reviewed UI
   * copy precedent: this becomes literal spoken audio a guest hears before
   * Step 34's real-speaker bake-off has evaluated anything, so both render
   * as canonical English in every locale until that review happens —
   * Gate 6's own evidence bullet requires real Pakistani speakers to test
   * Urdu before launch, not before this template exists.
   */
  readonly firstMessage: LocalizedText;
  readonly closingMessage: LocalizedText;
  readonly maxCallDurationSeconds: number;
  readonly silenceTimeoutSeconds: number;
  /**
   * Guest-said keywords that end the call cleanly (Vapi's own end-call
   * keyword matching, not spoken assistant content) — English only for now;
   * Roman Urdu/Urdu-script equivalents are added once Step 34's real-speaker
   * bake-off validates actual phrasing, not guessed ahead of it.
   */
  readonly endCallTriggerPhrases: readonly string[];
  readonly voiceStack: VoiceStackSelection;
  /** Always `false` until Gate 6's separate recording-consent/retention gate passes — `production-architecture-v2.md` §9.7. */
  readonly recordingEnabled: false;
  readonly changeNote: string;
  readonly updatedAt: string;
}

/** One profile per (environment, locale) cell — every cell required, no implicit default. */
export type VapiProfileMatrix = Readonly<
  Record<VapiEnvironmentName, Readonly<Record<Locale, VapiAssistantProfile>>>
>;

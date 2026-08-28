/**
 * The controlled Vapi assistant configuration matrix — Runbook Step 30.
 *
 * One `VapiAssistantProfile` per (environment, locale) cell. All six cells
 * currently share the same content and `configVersion` ('v1') because
 * nothing has diverged yet — day one of this artifact's life — but the
 * matrix *shape* is what makes future divergence safe: promoting a prompt
 * change through development → preview → production (`docs/
 * vapi-deployment.md`) is a per-cell edit plus a `CHANGELOG.md` entry, never
 * a structural rewrite, and a preview cell can sit on a newer version than
 * production while it's being evaluated without touching production's cell
 * at all.
 *
 * No assistant id, org id, or credential appears anywhere in this file —
 * see `types.ts`'s doc comment for why that is structural, not a
 * convention to remember.
 */

import type { Locale } from '../../../lib/i18n/locale';
import { canonicalLocalizedText } from '../../../lib/i18n/localized-text';
import { POLICY_VERSIONS, TOOL_SCHEMA_VERSIONS, buildVoiceSystemPrompt } from './policy';
import type { VapiAssistantProfile, VapiEnvironmentName, VapiProfileMatrix } from './types';
import { VAPI_ENVIRONMENTS } from './types';
import { LOCALES } from '../../../lib/i18n/locale';

const CONFIG_VERSION = 'v1';
const POLICY_VERSION: keyof typeof POLICY_VERSIONS = 'v1';
const TOOL_SCHEMA_VERSION: keyof typeof TOOL_SCHEMA_VERSIONS = 'v1';
const UPDATED_AT = '2026-08-28T00:00:00.000Z';
const CHANGE_NOTE =
  'Initial controlled template (Step 30): policy/tool-schema versions pinned, voice/transcriber selection deliberately left PENDING_BAKEOFF.';

const FIRST_MESSAGE = canonicalLocalizedText(
  'Hi, this is the Cladium Café and Resort concierge. How can I help — the menu, a table or treehouse request, or a birthday enquiry?',
);

const CLOSING_MESSAGE = canonicalLocalizedText(
  'Thanks for calling Cladium Café and Resort. If you need anything else, our team is also on WhatsApp.',
);

const END_CALL_TRIGGER_PHRASES: readonly string[] = [
  'bye',
  'goodbye',
  "that's all, thanks",
  "that's it, thanks",
  'no that will be all',
];

function buildProfile(environment: VapiEnvironmentName, locale: Locale): VapiAssistantProfile {
  return {
    environment,
    locale,
    configVersion: CONFIG_VERSION,
    policyVersion: POLICY_VERSION,
    toolSchemaVersion: TOOL_SCHEMA_VERSION,
    systemPrompt: buildVoiceSystemPrompt(locale),
    firstMessage: FIRST_MESSAGE,
    closingMessage: CLOSING_MESSAGE,
    maxCallDurationSeconds: 300,
    silenceTimeoutSeconds: 15,
    endCallTriggerPhrases: END_CALL_TRIGGER_PHRASES,
    voiceStack: { status: 'PENDING_BAKEOFF' },
    recordingEnabled: false,
    changeNote: CHANGE_NOTE,
    updatedAt: UPDATED_AT,
  };
}

function buildLocaleRow(
  environment: VapiEnvironmentName,
): Readonly<Record<Locale, VapiAssistantProfile>> {
  const entries = LOCALES.map((locale) => [locale, buildProfile(environment, locale)] as const);
  return Object.fromEntries(entries) as Readonly<Record<Locale, VapiAssistantProfile>>;
}

export const VAPI_PROFILE_MATRIX: VapiProfileMatrix = Object.fromEntries(
  VAPI_ENVIRONMENTS.map((environment) => [environment, buildLocaleRow(environment)] as const),
) as VapiProfileMatrix;

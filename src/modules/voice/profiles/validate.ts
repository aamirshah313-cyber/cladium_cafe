/**
 * Pure structural validation for the Vapi profile matrix — Runbook Step 30.
 *
 * Deliberately redundant with what the type system already guarantees
 * (`types.ts` has no credential field to begin with) — the same
 * belt-and-suspenders reasoning `scripts/security/scan-secrets.mjs` and the
 * client-bundle scan already apply elsewhere in this codebase: a type can
 * be widened by a careless future edit, a runtime check on the actual
 * object cannot silently stop firing the same way.
 */

import { LOCALES, type Locale } from '../../../lib/i18n/locale';
import { POLICY_VERSIONS, TOOL_SCHEMA_VERSIONS } from './policy';
import { VAPI_ENVIRONMENTS, type VapiAssistantProfile, type VapiProfileMatrix } from './types';

const BANNED_KEY_PATTERN = /assistantid|orgid|privatekey|apikey|secret|token|credential/i;

export interface VoiceProfileValidationIssue {
  readonly environment: string;
  readonly locale: string;
  readonly reason: string;
}

function validateOneProfile(
  expectedEnvironment: string,
  expectedLocale: Locale,
  profile: VapiAssistantProfile,
): readonly VoiceProfileValidationIssue[] {
  const issues: VoiceProfileValidationIssue[] = [];
  const at = (reason: string): void => {
    issues.push({ environment: expectedEnvironment, locale: expectedLocale, reason });
  };

  if (profile.environment !== expectedEnvironment) {
    at(
      `profile.environment ("${profile.environment}") does not match its matrix cell ("${expectedEnvironment}")`,
    );
  }
  if (profile.locale !== expectedLocale) {
    at(`profile.locale ("${profile.locale}") does not match its matrix cell ("${expectedLocale}")`);
  }
  if (profile.recordingEnabled !== false) {
    at("recordingEnabled must stay false until Gate 6's recording-consent gate passes");
  }
  if (!(profile.policyVersion in POLICY_VERSIONS)) {
    at(`policyVersion "${profile.policyVersion}" has no recorded fingerprint in POLICY_VERSIONS`);
  }
  if (!(profile.toolSchemaVersion in TOOL_SCHEMA_VERSIONS)) {
    at(
      `toolSchemaVersion "${profile.toolSchemaVersion}" has no recorded fingerprint in TOOL_SCHEMA_VERSIONS`,
    );
  }
  if (profile.maxCallDurationSeconds <= 0 || profile.maxCallDurationSeconds > 1800) {
    at(
      `maxCallDurationSeconds (${profile.maxCallDurationSeconds}) must be a bounded positive value (<= 30 minutes)`,
    );
  }
  if (profile.silenceTimeoutSeconds <= 0) {
    at(`silenceTimeoutSeconds (${profile.silenceTimeoutSeconds}) must be positive`);
  }

  const bannedKey = Object.keys(profile).find((key) => BANNED_KEY_PATTERN.test(key));
  if (bannedKey) {
    at(
      `profile object unexpectedly has a credential/id-shaped field "${bannedKey}" — assistant ids and secrets must come only from server env vars, never a checked-in template`,
    );
  }

  return issues;
}

/**
 * Checks every (environment, locale) cell is present, self-consistent, and
 * free of anything credential- or id-shaped. Returns an empty array when
 * the matrix is valid — never throws, matching this codebase's `Result`-
 * flavoured "describe the problem, don't crash the caller" convention for
 * validation.
 */
export function validateVoiceProfileMatrix(
  matrix: VapiProfileMatrix,
): readonly VoiceProfileValidationIssue[] {
  const issues: VoiceProfileValidationIssue[] = [];

  for (const environment of VAPI_ENVIRONMENTS) {
    const row = matrix[environment];
    if (!row) {
      issues.push({ environment, locale: '(all)', reason: 'missing environment row entirely' });
      continue;
    }
    for (const locale of LOCALES) {
      const profile = row[locale];
      if (!profile) {
        issues.push({
          environment,
          locale,
          reason: 'missing profile for this (environment, locale) cell',
        });
        continue;
      }
      issues.push(...validateOneProfile(environment, locale, profile));
    }
  }

  return issues;
}

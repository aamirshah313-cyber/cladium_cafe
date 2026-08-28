import { describe, expect, it } from 'vitest';
import { clientEnvSchema } from '../../src/lib/env';
import { LOCALES } from '../../src/lib/i18n/locale';
import { resolveLocalizedText } from '../../src/lib/i18n/localized-text';
import {
  POLICY_VERSIONS,
  TOOL_SCHEMA_VERSIONS,
  buildVoiceSystemPrompt,
  computePolicyFingerprint,
  computeToolSchemaFingerprint,
} from '../../src/modules/voice/profiles/policy';
import { VAPI_PROFILE_MATRIX } from '../../src/modules/voice/profiles/templates';
import { VAPI_ENVIRONMENTS, type VapiProfileMatrix } from '../../src/modules/voice/profiles/types';
import { validateVoiceProfileMatrix } from '../../src/modules/voice/profiles/validate';
import { CONCIERGE_SYSTEM_POLICY } from '../../src/modules/concierge/policy';

describe('shared policy/tool schema version drift detection', () => {
  it('POLICY_VERSIONS.v1 still matches the live CONCIERGE_SYSTEM_POLICY fingerprint', () => {
    // If this fails, CONCIERGE_SYSTEM_POLICY changed without a corresponding
    // voice-config version bump — see CHANGELOG.md's "whenever it changes" checklist.
    expect(computePolicyFingerprint()).toBe(POLICY_VERSIONS.v1);
  });

  it('TOOL_SCHEMA_VERSIONS.v1 still matches the live TOOL_DEFINITIONS fingerprint', () => {
    expect(computeToolSchemaFingerprint()).toBe(TOOL_SCHEMA_VERSIONS.v1);
  });
});

describe('buildVoiceSystemPrompt', () => {
  it('embeds CONCIERGE_SYSTEM_POLICY verbatim, never a rewritten copy', () => {
    for (const locale of ['en', 'ur'] as const) {
      expect(buildVoiceSystemPrompt(locale)).toContain(CONCIERGE_SYSTEM_POLICY);
    }
  });

  it('adds a voice-conduct addendum distinct from the shared policy text', () => {
    const prompt = buildVoiceSystemPrompt('en');
    expect(prompt.length).toBeGreaterThan(CONCIERGE_SYSTEM_POLICY.length);
    expect(prompt).toContain('cannot see text');
  });
});

describe('VAPI_PROFILE_MATRIX', () => {
  it('has no validation issues', () => {
    expect(validateVoiceProfileMatrix(VAPI_PROFILE_MATRIX)).toEqual([]);
  });

  it('covers every (environment, locale) cell exactly once', () => {
    for (const environment of VAPI_ENVIRONMENTS) {
      for (const locale of LOCALES) {
        const profile = VAPI_PROFILE_MATRIX[environment][locale];
        expect(profile.environment).toBe(environment);
        expect(profile.locale).toBe(locale);
      }
    }
  });

  it('every cell has recording disabled', () => {
    for (const environment of VAPI_ENVIRONMENTS) {
      for (const locale of LOCALES) {
        expect(VAPI_PROFILE_MATRIX[environment][locale].recordingEnabled).toBe(false);
      }
    }
  });

  it('every cell is still PENDING_BAKEOFF — no provider/voice/transcriber chosen before Step 34', () => {
    for (const environment of VAPI_ENVIRONMENTS) {
      for (const locale of LOCALES) {
        expect(VAPI_PROFILE_MATRIX[environment][locale].voiceStack).toEqual({
          status: 'PENDING_BAKEOFF',
        });
      }
    }
  });

  it('firstMessage/closingMessage render identically in both locales — no invented Urdu speech content yet', () => {
    for (const environment of VAPI_ENVIRONMENTS) {
      const en = VAPI_PROFILE_MATRIX[environment].en;
      const ur = VAPI_PROFILE_MATRIX[environment].ur;
      expect(resolveLocalizedText(en.firstMessage, 'en')).toBe(
        resolveLocalizedText(ur.firstMessage, 'ur'),
      );
      expect(resolveLocalizedText(en.closingMessage, 'en')).toBe(
        resolveLocalizedText(ur.closingMessage, 'ur'),
      );
      expect(en.firstMessage.urStatus).toBe('missing');
      expect(en.closingMessage.urStatus).toBe('missing');
    }
  });

  it('no profile object carries an assistant id, org id, or any credential-shaped field', () => {
    const bannedKeys = ['assistantId', 'orgId', 'privateKey', 'apiKey', 'secret', 'webhookSecret'];
    for (const environment of VAPI_ENVIRONMENTS) {
      for (const locale of LOCALES) {
        const keys = Object.keys(VAPI_PROFILE_MATRIX[environment][locale]);
        for (const banned of bannedKeys) {
          expect(keys).not.toContain(banned);
        }
      }
    }
  });

  it('every call is bounded (max duration and silence timeout are positive and capped)', () => {
    for (const environment of VAPI_ENVIRONMENTS) {
      for (const locale of LOCALES) {
        const profile = VAPI_PROFILE_MATRIX[environment][locale];
        expect(profile.maxCallDurationSeconds).toBeGreaterThan(0);
        expect(profile.maxCallDurationSeconds).toBeLessThanOrEqual(1800);
        expect(profile.silenceTimeoutSeconds).toBeGreaterThan(0);
      }
    }
  });
});

describe('validateVoiceProfileMatrix catches real problems, not just the happy path', () => {
  function withOverride(
    mutate: (matrix: VapiProfileMatrix) => VapiProfileMatrix,
  ): VapiProfileMatrix {
    return mutate(structuredClone(VAPI_PROFILE_MATRIX) as VapiProfileMatrix);
  }

  it('flags a missing (environment, locale) cell', () => {
    const broken = withOverride((matrix) => {
      // @ts-expect-error deliberately deleting a required cell for the test
      delete matrix.production.ur;
      return matrix;
    });
    const issues = validateVoiceProfileMatrix(broken);
    expect(issues.some((i) => i.environment === 'production' && i.locale === 'ur')).toBe(true);
  });

  it('flags recordingEnabled flipped to true', () => {
    const broken = withOverride((matrix) => {
      // @ts-expect-error deliberately violating the literal-false type for the test
      matrix.development.en.recordingEnabled = true;
      return matrix;
    });
    const issues = validateVoiceProfileMatrix(broken);
    expect(issues.some((i) => i.reason.includes('recordingEnabled'))).toBe(true);
  });

  it('flags an unrecorded policyVersion reference', () => {
    const broken = withOverride((matrix) => {
      // @ts-expect-error deliberately using an unrecorded version for the test
      matrix.preview.en.policyVersion = 'v99-nonexistent';
      return matrix;
    });
    const issues = validateVoiceProfileMatrix(broken);
    expect(issues.some((i) => i.reason.includes('policyVersion'))).toBe(true);
  });

  it('flags a credential-shaped field added to a profile', () => {
    const broken = withOverride((matrix) => {
      // @ts-expect-error deliberately adding a banned field for the test
      matrix.production.en.assistantId = 'asst_leaked_across_envs';
      return matrix;
    });
    const issues = validateVoiceProfileMatrix(broken);
    expect(issues.some((i) => i.reason.includes('credential/id-shaped'))).toBe(true);
  });

  it('a fully valid matrix reports zero issues', () => {
    expect(validateVoiceProfileMatrix(VAPI_PROFILE_MATRIX)).toHaveLength(0);
  });
});

describe('Vapi secrets are server-only (evidence bullet: "secrets are server-only")', () => {
  it('no VAPI_* variable is declared in the client-safe env schema', () => {
    const clientKeys = Object.keys(clientEnvSchema.shape);
    for (const key of clientKeys) {
      expect(key.startsWith('VAPI_')).toBe(false);
      expect(key).not.toContain('VAPI');
    }
  });
});

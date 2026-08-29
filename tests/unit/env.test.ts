import { describe, expect, it } from 'vitest';
import { parseClientEnv } from '../../src/lib/env';
import {
  isFeatureEnabled,
  parseCronSecret,
  parseFeatureFlags,
  parseMetaCredentials,
  parseServerEnv,
  parseStaffDevAccounts,
  parseWhatsAppCredentials,
  parseWhatsAppWebhookSecret,
  parseWhatsAppWebhookVerifyToken,
} from '../../src/lib/env.server';
import { launchFeatureFlags, validClientEnv, validServerEnv } from '../fixtures/env';

// Fixtures are synthetic placeholders, not real credentials — see tests/fixtures/env.ts.

describe('parseClientEnv', () => {
  it('accepts a fully populated valid client env', () => {
    expect(parseClientEnv(validClientEnv)).toEqual(validClientEnv);
  });

  it('rejects a missing required client var', () => {
    const { NEXT_PUBLIC_APP_URL: _omit, ...rest } = validClientEnv;
    expect(() => parseClientEnv(rest)).toThrow();
  });

  it('rejects a non-URL value', () => {
    expect(() => parseClientEnv({ ...validClientEnv, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow();
  });
});

describe('parseServerEnv', () => {
  it('accepts a valid server env with optional Meta/WhatsApp vars omitted', () => {
    expect(parseServerEnv(validServerEnv)).toEqual(validServerEnv);
  });

  it('rejects a SESSION_SECRET shorter than 32 characters', () => {
    expect(() => parseServerEnv({ ...validServerEnv, SESSION_SECRET: 'too-short' })).toThrow();
  });

  it('rejects a missing required server var', () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = validServerEnv;
    expect(() => parseServerEnv(rest)).toThrow();
  });
});

describe('parseFeatureFlags', () => {
  it('accepts the documented launch defaults', () => {
    const flags = parseFeatureFlags(launchFeatureFlags);
    expect(flags.FEATURE_PUBLIC_SITE).toBe('true');
    expect(flags.FEATURE_WHATSAPP_CLOUD).toBe('false');
    expect(flags.FEATURE_ONLINE_PAYMENT).toBe('false');
  });

  it('rejects a non-boolean-string flag value', () => {
    expect(() =>
      parseFeatureFlags({ ...launchFeatureFlags, FEATURE_PUBLIC_SITE: 'yes' }),
    ).toThrow();
  });

  it('exposes flags as booleans via isFeatureEnabled', () => {
    expect(isFeatureEnabled('FEATURE_PUBLIC_SITE', launchFeatureFlags)).toBe(true);
    expect(isFeatureEnabled('FEATURE_ONLINE_PAYMENT', launchFeatureFlags)).toBe(false);
  });

  it('keeps every gated integration off by default', () => {
    for (const flag of [
      'FEATURE_WHATSAPP_CLOUD',
      'FEATURE_META_MARKETING',
      'FEATURE_ONLINE_PAYMENT',
    ] as const) {
      expect(isFeatureEnabled(flag, launchFeatureFlags)).toBe(false);
    }
  });
});

describe('parseStaffDevAccounts', () => {
  it('returns an empty array when STAFF_DEV_ACCOUNTS is unset — production default', () => {
    expect(parseStaffDevAccounts({})).toEqual([]);
  });

  it('returns an empty array for a blank value', () => {
    expect(parseStaffDevAccounts({ STAFF_DEV_ACCOUNTS: '' })).toEqual([]);
  });

  it('parses a well-formed account list', () => {
    const raw = JSON.stringify([
      { staffId: 'staff-1', displayName: 'Aamir', roles: ['OWNER'], devPassword: 'x'.repeat(12) },
    ]);
    expect(parseStaffDevAccounts({ STAFF_DEV_ACCOUNTS: raw })).toEqual([
      { staffId: 'staff-1', displayName: 'Aamir', roles: ['OWNER'], devPassword: 'x'.repeat(12) },
    ]);
  });

  it('fails closed (empty array) for malformed JSON rather than throwing', () => {
    expect(parseStaffDevAccounts({ STAFF_DEV_ACCOUNTS: '{not json' })).toEqual([]);
  });

  it('fails closed (empty array) for a schema-invalid account (short password, bad role)', () => {
    const raw = JSON.stringify([
      { staffId: 'staff-1', displayName: 'Aamir', roles: ['NOT_A_ROLE'], devPassword: 'short' },
    ]);
    expect(parseStaffDevAccounts({ STAFF_DEV_ACCOUNTS: raw })).toEqual([]);
  });
});

describe('parseCronSecret', () => {
  it('returns the configured secret', () => {
    expect(parseCronSecret({ CRON_SECRET: 'a-cron-secret' })).toBe('a-cron-secret');
  });

  it('returns undefined, not a throw, when unset', () => {
    expect(parseCronSecret({})).toBeUndefined();
  });

  it('does not require any other server env var to be set', () => {
    expect(parseCronSecret({ CRON_SECRET: 'a-cron-secret' })).toBe('a-cron-secret');
  });
});

describe('parseMetaCredentials — Runbook Step 37', () => {
  it('returns undefined, not a throw, when unset — matches .env.example', () => {
    expect(parseMetaCredentials({})).toBeUndefined();
  });

  it('returns undefined when only some of the three vars are configured', () => {
    expect(parseMetaCredentials({ META_PIXEL_ID: 'pixel-1' })).toBeUndefined();
    expect(
      parseMetaCredentials({ META_PIXEL_ID: 'pixel-1', META_DATASET_ID: 'dataset-1' }),
    ).toBeUndefined();
  });

  it('returns the parsed credentials once all three are configured', () => {
    expect(
      parseMetaCredentials({
        META_PIXEL_ID: 'pixel-1',
        META_DATASET_ID: 'dataset-1',
        META_CONVERSIONS_API_TOKEN: 'token-1',
      }),
    ).toEqual({ pixelId: 'pixel-1', datasetId: 'dataset-1', conversionsApiToken: 'token-1' });
  });

  it('does not require any other server env var to be set', () => {
    expect(
      parseMetaCredentials({
        META_PIXEL_ID: 'pixel-1',
        META_DATASET_ID: 'dataset-1',
        META_CONVERSIONS_API_TOKEN: 'token-1',
      }),
    ).toBeDefined();
  });
});

describe('parseWhatsAppCredentials — Runbook Step 38', () => {
  it('returns undefined, not a throw, when unset — matches .env.example', () => {
    expect(parseWhatsAppCredentials({})).toBeUndefined();
  });

  it('returns undefined when only some of the three vars are configured', () => {
    expect(parseWhatsAppCredentials({ WHATSAPP_PHONE_NUMBER_ID: 'phone-1' })).toBeUndefined();
  });

  it('returns the parsed credentials once all three are configured', () => {
    expect(
      parseWhatsAppCredentials({
        WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
        WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-1',
        WHATSAPP_ACCESS_TOKEN: 'token-1',
      }),
    ).toEqual({ phoneNumberId: 'phone-1', businessAccountId: 'waba-1', accessToken: 'token-1' });
  });
});

describe('parseWhatsAppWebhookSecret / parseWhatsAppWebhookVerifyToken — Runbook Step 38', () => {
  it('return undefined, not a throw, when unset', () => {
    expect(parseWhatsAppWebhookSecret({})).toBeUndefined();
    expect(parseWhatsAppWebhookVerifyToken({})).toBeUndefined();
  });

  it('return the configured value, independently of each other and of WHATSAPP_ACCESS_TOKEN', () => {
    expect(parseWhatsAppWebhookSecret({ WHATSAPP_APP_SECRET: 'app-secret-1' })).toBe(
      'app-secret-1',
    );
    expect(
      parseWhatsAppWebhookVerifyToken({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-token-1' }),
    ).toBe('verify-token-1');
  });
});

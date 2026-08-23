/**
 * Synthetic environment fixtures. None of these are real credentials — the
 * values are obvious placeholders and must stay that way so the secret
 * scanner keeps passing.
 */

export const validClientEnv = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
} as const;

export const validServerEnv = {
  DATABASE_URL: 'postgresql://user:pass@pooled-host:6543/db',
  DIRECT_DATABASE_URL: 'postgresql://user:pass@direct-host:5432/db',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SESSION_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'test-cron-secret',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  VAPI_ORG_ID: 'test-org-id',
  VAPI_PRIVATE_KEY: 'test-private-key',
  VAPI_ASSISTANT_EN_ID: 'test-assistant-en',
  VAPI_ASSISTANT_UR_ID: 'test-assistant-ur',
  VAPI_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
} as const;

/** The documented launch defaults: only the public site is on. */
export const launchFeatureFlags = {
  FEATURE_PUBLIC_SITE: 'true',
  FEATURE_TAKEAWAY_REQUESTS: 'false',
  FEATURE_BOOKING_REQUESTS: 'false',
  FEATURE_EVENT_REQUESTS: 'false',
  FEATURE_TEXT_CONCIERGE: 'false',
  FEATURE_VOICE_EN: 'false',
  FEATURE_VOICE_UR: 'false',
  FEATURE_WHATSAPP_CLOUD: 'false',
  FEATURE_META_MARKETING: 'false',
  FEATURE_ONLINE_PAYMENT: 'false',
} as const;

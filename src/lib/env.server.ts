/**
 * Server-only environment.
 *
 * The guard below runs at MODULE LOAD, not per call: importing this file from
 * client code throws immediately, before any schema symbol or variable name
 * can be evaluated into a browser bundle. Client-safe values live in
 * `env.ts`.
 *
 * Never import this module from a client component, and never re-export any
 * of its symbols from a client-importable module.
 */

import { z } from 'zod';
import { assertServerOnly } from './server-only';
import { staffRoleSchema } from './schemas/common';

assertServerOnly('src/lib/env.server.ts');

/** Secrets and privileged connection strings. Never `NEXT_PUBLIC_*`. */
export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  VAPI_ORG_ID: z.string().min(1),
  VAPI_PRIVATE_KEY: z.string().min(1),
  VAPI_ASSISTANT_EN_ID: z.string().min(1),
  VAPI_ASSISTANT_UR_ID: z.string().min(1),
  VAPI_WEBHOOK_HMAC_SECRET: z.string().min(1),
  // Unset until their release gates are approved — optional here is the
  // schema saying "absent is valid", not "invent one if absent".
  META_PIXEL_ID: z.string().optional(),
  META_DATASET_ID: z.string().optional(),
  META_CONVERSIONS_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
});

const booleanString = z.enum(['true', 'false']);

/**
 * Server-authoritative launch flags. Every flag is required — there is no
 * implicit default, so a missing flag fails loudly instead of silently
 * enabling or disabling a capability.
 */
export const featureFlagSchema = z.object({
  FEATURE_PUBLIC_SITE: booleanString,
  FEATURE_TAKEAWAY_REQUESTS: booleanString,
  FEATURE_BOOKING_REQUESTS: booleanString,
  FEATURE_EVENT_REQUESTS: booleanString,
  FEATURE_TEXT_CONCIERGE: booleanString,
  FEATURE_VOICE_EN: booleanString,
  FEATURE_VOICE_UR: booleanString,
  FEATURE_WHATSAPP_CLOUD: booleanString,
  FEATURE_META_MARKETING: booleanString,
  FEATURE_ONLINE_PAYMENT: booleanString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type FeatureFlagEnv = z.infer<typeof featureFlagSchema>;

type EnvSource = Record<string, string | undefined>;

export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function parseFeatureFlags(source: EnvSource = process.env): FeatureFlagEnv {
  return featureFlagSchema.parse(source);
}

const sessionSecretSchema = serverEnvSchema.pick({ SESSION_SECRET: true });

/**
 * Narrow accessor for just `SESSION_SECRET`, for callers (locale negotiation,
 * cookie signing) that need HMAC signing but must not require every other
 * unrelated secret (Vapi, WhatsApp, Anthropic) to be configured first.
 */
export function parseSessionSecret(source: EnvSource = process.env): string {
  return sessionSecretSchema.parse(source).SESSION_SECRET;
}

const cronSecretSchema = serverEnvSchema.pick({ CRON_SECRET: true });

/**
 * Narrow accessor for just `CRON_SECRET` — Step 20's `parseAppUrl` bug (the
 * full-schema version fails closed even for a correctly-configured caller
 * whenever an unrelated var like a Vapi/WhatsApp key is unset) applies
 * identically here, so `app/api/cron/outbox-dispatch/route.ts` uses this,
 * not `parseServerEnv`.
 */
export function parseCronSecret(source: EnvSource = process.env): string | undefined {
  return cronSecretSchema.safeParse(source).data?.CRON_SECRET;
}

const anthropicApiKeySchema = serverEnvSchema.pick({ ANTHROPIC_API_KEY: true });

/**
 * Narrow accessor for just `ANTHROPIC_API_KEY` — same reasoning as
 * `parseSessionSecret`/`parseCronSecret`: `modules/integrations/
 * anthropic-client.ts` must not require every other unrelated secret
 * (Vapi, WhatsApp, session) to be configured before it can even attempt a
 * call. Throws if unset — a chat client is only ever constructed to be
 * used, unlike a cron endpoint that might legitimately never be called.
 */
export function parseAnthropicApiKey(source: EnvSource = process.env): string {
  return anthropicApiKeySchema.parse(source).ANTHROPIC_API_KEY;
}

const vapiCredentialsSchema = serverEnvSchema.pick({
  VAPI_ORG_ID: true,
  VAPI_PRIVATE_KEY: true,
  VAPI_ASSISTANT_EN_ID: true,
  VAPI_ASSISTANT_UR_ID: true,
});

export type VapiCredentials = z.infer<typeof vapiCredentialsSchema>;

/**
 * Narrow accessor for just the four Vapi values `modules/integrations/
 * vapi-client.ts#createVapiTokenIssuer` needs — same reasoning as
 * `parseAnthropicApiKey`: token issuance must not require every other
 * unrelated secret (session, cron, Anthropic) to be configured first.
 * `VAPI_WEBHOOK_HMAC_SECRET` is deliberately excluded — that belongs to
 * Step 32's tool/webhook verification, a different caller, at a different
 * trust boundary. Throws if unset, same as `parseAnthropicApiKey`: token
 * issuance is only ever attempted to be used.
 */
export function parseVapiCredentials(source: EnvSource = process.env): VapiCredentials {
  return vapiCredentialsSchema.parse(source);
}

const vapiWebhookSecretSchema = serverEnvSchema.pick({ VAPI_WEBHOOK_HMAC_SECRET: true });

/**
 * Narrow accessor for just `VAPI_WEBHOOK_HMAC_SECRET` — same "returns
 * `undefined` rather than throwing" shape as `parseCronSecret`: an
 * unconfigured secret must make every inbound `/api/vapi/{tools,webhook}`
 * request fail closed (rejected), not 500. Step 32's routes reject before
 * ever calling the HMAC verifier when this is falsy — the same reasoning
 * `security/cron-auth.ts#verifyCronAuthHeader` already documents.
 */
export function parseVapiWebhookSecret(source: EnvSource = process.env): string | undefined {
  return vapiWebhookSecretSchema.safeParse(source).data?.VAPI_WEBHOOK_HMAC_SECRET;
}

const metaCredentialsSchema = serverEnvSchema
  .pick({
    META_PIXEL_ID: true,
    META_DATASET_ID: true,
    META_CONVERSIONS_API_TOKEN: true,
  })
  .extend({
    META_PIXEL_ID: z.string().min(1),
    META_DATASET_ID: z.string().min(1),
    META_CONVERSIONS_API_TOKEN: z.string().min(1),
  });

export interface MetaCredentials {
  readonly pixelId: string;
  readonly datasetId: string;
  readonly conversionsApiToken: string;
}

/**
 * Runbook Step 37 — same "returns `undefined` rather than throwing" shape
 * as `parseVapiWebhookSecret`: all three of `META_PIXEL_ID`/
 * `META_DATASET_ID`/`META_CONVERSIONS_API_TOKEN` must be present, or the
 * Meta adapter must fail closed (send nothing) rather than 500 — the same
 * reasoning that keeps `META_MARKETING` disabled by default. None are set
 * in `.env.example`, so this returns `undefined` until the business
 * supplies real credentials and the release gate is separately approved.
 */
export function parseMetaCredentials(source: EnvSource = process.env): MetaCredentials | undefined {
  const parsed = metaCredentialsSchema.safeParse(source);
  if (!parsed.success) return undefined;
  return {
    pixelId: parsed.data.META_PIXEL_ID,
    datasetId: parsed.data.META_DATASET_ID,
    conversionsApiToken: parsed.data.META_CONVERSIONS_API_TOKEN,
  };
}

const whatsAppCredentialsSchema = serverEnvSchema
  .pick({
    WHATSAPP_PHONE_NUMBER_ID: true,
    WHATSAPP_BUSINESS_ACCOUNT_ID: true,
    WHATSAPP_ACCESS_TOKEN: true,
  })
  .extend({
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  });

export interface WhatsAppCredentials {
  readonly phoneNumberId: string;
  readonly businessAccountId: string;
  readonly accessToken: string;
}

/**
 * Runbook Step 38 — same "returns `undefined` rather than throwing" shape
 * as `parseMetaCredentials`: all three of `WHATSAPP_PHONE_NUMBER_ID`/
 * `WHATSAPP_BUSINESS_ACCOUNT_ID`/`WHATSAPP_ACCESS_TOKEN` must be present,
 * or `whatsapp-client.ts#sendTemplateMessage` must fail closed rather than
 * 500. None are set in `.env.example` — `cladium-research/operations/
 * whatsapp-cloud-readiness.md`'s prerequisites must pass and the owner
 * must approve before any environment ever configures these.
 */
export function parseWhatsAppCredentials(
  source: EnvSource = process.env,
): WhatsAppCredentials | undefined {
  const parsed = whatsAppCredentialsSchema.safeParse(source);
  if (!parsed.success) return undefined;
  return {
    phoneNumberId: parsed.data.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: parsed.data.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: parsed.data.WHATSAPP_ACCESS_TOKEN,
  };
}

const whatsAppWebhookSecretSchema = serverEnvSchema.pick({ WHATSAPP_APP_SECRET: true });

/**
 * Narrow accessor for just `WHATSAPP_APP_SECRET` — the key behind Meta's
 * `X-Hub-Signature-256` webhook signature (`whatsapp-webhook-auth.ts`).
 * Same fail-closed-to-`undefined` shape as `parseVapiWebhookSecret`: an
 * unconfigured secret must make every inbound `/api/whatsapp/webhook`
 * `POST` fail closed, not 500.
 */
export function parseWhatsAppWebhookSecret(source: EnvSource = process.env): string | undefined {
  return whatsAppWebhookSecretSchema.safeParse(source).data?.WHATSAPP_APP_SECRET;
}

const whatsAppWebhookVerifyTokenSchema = serverEnvSchema.pick({
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: true,
});

/**
 * Narrow accessor for just `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — a distinct
 * secret from `WHATSAPP_APP_SECRET`, used only for Meta's one-time `GET`
 * subscription handshake (`hub.verify_token`), never for signing.
 */
export function parseWhatsAppWebhookVerifyToken(
  source: EnvSource = process.env,
): string | undefined {
  return whatsAppWebhookVerifyTokenSchema.safeParse(source).data?.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
}

/**
 * Narrow, per-flag view of a launch flag — the same "don't require every
 * unrelated var to be configured" reasoning as `parseSessionSecret`/
 * `parseCronSecret`/`parseAnthropicApiKey` above, now applied to feature
 * flags: this checks only `flag`'s own raw value against `booleanString`,
 * never routing through `parseFeatureFlags`'s full-batch validation.
 * `parseFeatureFlags` itself is unchanged and still throws if *any* flag
 * is missing — a legitimate deploy-time "did we configure everything"
 * check for a caller that wants the whole set — but no per-request
 * runtime caller should ever have one unrelated missing flag turn "is
 * voice enabled?" into a 500 instead of a clean "disabled." Found as a
 * real, verified failure during Step 39's E2E/accessibility matrix run:
 * `/concierge` crashed in this all-flags-unset sandbox instead of
 * rendering its flag-off state, blocking coverage of "chat, voice shell"
 * entirely — the same standing gap `/api/whatsapp/webhook` (Step 38)
 * already worked around locally; this fixes it at the source so every
 * caller benefits, not just one route.
 */
export function isFeatureEnabled(
  flag: keyof FeatureFlagEnv,
  source: EnvSource = process.env,
): boolean {
  return booleanString.safeParse(source[flag]).data === 'true';
}

/**
 * A single development-only staff sign-in fixture — Runbook Step 24. Real
 * staff identity is Supabase Auth linked to `staff_profiles`
 * (data-model-v2.md §6), which needs a live project this sandbox does not
 * have (D-017); this is a stand-in so the staff workspace can be built and
 * tested now, never a second production auth path.
 */
const staffDevAccountSchema = z.object({
  staffId: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(staffRoleSchema).min(1),
  devPassword: z.string().min(8),
});

export type StaffDevAccount = z.infer<typeof staffDevAccountSchema>;

const staffDevAccountsSchema = z.array(staffDevAccountSchema);

/**
 * Parses the optional `STAFF_DEV_ACCOUNTS` env var (a JSON array of
 * `StaffDevAccount`). Absent, empty, or malformed all resolve to `[]` —
 * fail closed, the same as an unconfigured feature rather than a crash —
 * so production (where this variable must never be set) always has zero
 * accounts and staff sign-in always fails. Never log or echo the parsed
 * array: it carries `devPassword` values.
 */
export function parseStaffDevAccounts(source: EnvSource = process.env): readonly StaffDevAccount[] {
  const raw = source.STAFF_DEV_ACCOUNTS;
  if (!raw) return [];
  try {
    return staffDevAccountsSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

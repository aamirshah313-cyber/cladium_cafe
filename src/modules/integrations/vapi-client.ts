/**
 * Vapi browser-voice token issuance — Runbook Step 31 (ADR-0006: short-lived
 * JWT and HMAC tool auth).
 *
 * `signVapiPublicToken`'s claim shape (`orgId` + `token.restrictions.
 * allowedAssistantIds`/`allowedOrigins`) is a best-effort mapping to Vapi's
 * documented restricted-public-JWT format. **No live `VAPI_PRIVATE_KEY`
 * exists in this sandbox, so this has never been verified against the real
 * Vapi API** — the same standing limitation `anthropic-client.ts` notes for
 * `ANTHROPIC_API_KEY` (D-031) and `voice/profiles/` notes for the
 * assistant-creation procedure (D-034). Before this ever issues a token
 * used to start a real call, confirm the claim shape against Vapi's current
 * API docs; if it differs, only this function needs to change — the caller
 * (`modules/voice/token/issue-vapi-token.ts`) depends on the
 * `VapiTokenIssuer` interface below, never this shape directly, matching
 * ADR-0008's reversibility goal.
 *
 * `createVapiTokenIssuer()` never throws at construction — the same "fail
 * only when actually used" shape as `createAnthropicChatClient()`: Vapi
 * credentials are read lazily inside `issueToken`, so importing this module
 * (`modules/voice/deps.ts` does, at process start) can never crash an
 * unrelated route.
 */

import type { Locale } from '../../lib/i18n/locale';
import { assertServerOnly } from '../../lib/server-only';
import { parseVapiCredentials } from '../../lib/env.server';
import { signJwt } from '../../lib/security/jwt';

assertServerOnly('src/modules/integrations/vapi-client.ts');

type EnvSource = Record<string, string | undefined>;

/** Short-lived by design (`CLAUDE.md`: "short-lived origin- and assistant-restricted public JWTs"). */
export const VAPI_TOKEN_TTL_SECONDS = 120;

export interface VapiTokenClaims {
  readonly orgId: string;
  readonly token: {
    readonly tag: 'public';
    readonly restrictions: {
      readonly enabled: true;
      readonly allowedAssistantIds: readonly [string];
      readonly allowedOrigins: readonly [string];
      readonly allowTransientAssistant: false;
    };
  };
}

export interface IssueVapiTokenInput {
  readonly locale: Locale;
  /** The server's own configured origin (`parseAppUrl()`) — never a guest-supplied header value, even one already checked. */
  readonly origin: string;
  readonly now?: Date;
}

export interface IssuedVapiToken {
  readonly token: string;
  readonly assistantId: string;
  /** ISO 8601 — for the client's own bookkeeping; Vapi independently enforces `exp` inside the token itself. */
  readonly expiresAt: string;
}

export interface VapiTokenIssuer {
  issueToken(input: IssueVapiTokenInput): IssuedVapiToken;
}

function assistantIdForLocale(
  locale: Locale,
  credentials: { readonly VAPI_ASSISTANT_EN_ID: string; readonly VAPI_ASSISTANT_UR_ID: string },
): string {
  return locale === 'ur' ? credentials.VAPI_ASSISTANT_UR_ID : credentials.VAPI_ASSISTANT_EN_ID;
}

/**
 * `envSource` defaults to `process.env` for every real call site, exactly
 * like `parseServerEnv`/`parseAnthropicApiKey` themselves — the parameter
 * exists so this codebase's tests can inject a fake credential set without
 * mutating global `process.env`, the same dependency-injection convention
 * used throughout (`OrchestratorDeps`, `IssueVapiTokenDeps`).
 */
export function createVapiTokenIssuer(envSource: EnvSource = process.env): VapiTokenIssuer {
  return {
    issueToken(input) {
      const credentials = parseVapiCredentials(envSource);
      const assistantId = assistantIdForLocale(input.locale, credentials);

      const claims: VapiTokenClaims = {
        orgId: credentials.VAPI_ORG_ID,
        token: {
          tag: 'public',
          restrictions: {
            enabled: true,
            allowedAssistantIds: [assistantId],
            allowedOrigins: [input.origin],
            allowTransientAssistant: false,
          },
        },
      };

      const signed = signJwt(
        claims as unknown as Record<string, unknown>,
        credentials.VAPI_PRIVATE_KEY,
        {
          ttlSeconds: VAPI_TOKEN_TTL_SECONDS,
          now: input.now,
        },
      );

      return {
        token: signed.token,
        assistantId,
        expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
      };
    },
  };
}

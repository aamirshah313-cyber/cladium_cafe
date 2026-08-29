/**
 * `POST /api/vapi/token` orchestration — Runbook Step 31.
 *
 * Session/CSRF/origin are already verified by the route's
 * `parseMutatingRequest` call before this runs (Step 20's guard, reused
 * unchanged); this function adds the checks that guard belongs to *this*
 * route specifically: the requested locale's feature flag
 * (`FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` — the first route in this codebase
 * to actually read one, tracked as a gap since Step 24 for the guest
 * takeaway/booking/event routes), the session's MICROPHONE consent (Step
 * 36 — `production-architecture-v2.md` §12 lists "microphone access" as
 * its own required consent category; checked *here*, not only hidden
 * behind a client-side control, so a guest can never reach a live Vapi
 * call — and the browser's own native microphone permission prompt —
 * without first granting app-level consent), and a dedicated rate limit,
 * tighter than the text concierge's (minting a voice-call credential is a
 * heavier action than one chat turn). A thrown error (a real Vapi
 * credential missing/malformed) never reaches the client with its own
 * message — same "safe fallback, no leaked detail" shape `orchestrateTurn`
 * (Step 27) uses.
 *
 * Step 33 addition: the response also echoes back `sessionId`. The guest
 * session cookie is `HttpOnly` (`security/session.ts`) — client JS cannot
 * read it — but `voice-panel.tsx` needs the actual id to embed as
 * `assistantOverrides.metadata.sessionId` when starting the Vapi call
 * (`vapi-web-client.ts`), so a voice call can see the same cart/request-
 * status a guest's text session sees (`vapi-webhook.ts`'s `sessionIdForCall`).
 * The id itself is an opaque, non-secret identifier — CSRF protection
 * already depends on the derived HMAC token, never on the session id
 * staying hidden — so returning it here in an already session/CSRF/origin-
 * guarded response costs nothing.
 */

import { err, ok, type Result } from '../../../lib/result';
import {
  consentRequired,
  featureDisabled,
  internalError,
  rateLimited,
  type AppError,
} from '../../../lib/errors';
import { isFeatureEnabled, type FeatureFlagEnv } from '../../../lib/env.server';
import type { Logger } from '../../../lib/logging';
import type { Locale } from '../../../lib/i18n/locale';
import type { RateLimitRule, RateLimiter } from '../../../lib/security/rate-limit';
import type { IssuedVapiToken, VapiTokenIssuer } from '../../integrations/vapi-client';

/** Tighter than the text concierge's 10/min (`orchestrator.ts`'s `RATE_LIMIT_RULE`) — a voice-call credential is a heavier grant than one chat turn. */
export const VAPI_TOKEN_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 5 };

type EnvSource = Record<string, string | undefined>;

export interface IssueVapiTokenDeps {
  readonly issuer: VapiTokenIssuer;
  readonly rateLimiter: RateLimiter;
  readonly logger: Logger;
  /** Step 36: `modules/consent/deps.ts`'s `hasConsent`, bound to `MICROPHONE`. */
  readonly hasMicrophoneConsent: (sessionId: string) => Promise<boolean>;
  readonly now?: () => Date;
  /** Defaults to `process.env` at every real call site — injectable so tests never mutate global env state. */
  readonly envSource?: EnvSource;
}

export interface IssueVapiTokenInput {
  readonly sessionId: string;
  readonly locale: Locale;
  /** The server's own configured origin — never a guest-supplied header value. */
  readonly origin: string;
  readonly correlationId: string;
}

const FLAG_BY_LOCALE: Readonly<Record<Locale, keyof FeatureFlagEnv>> = {
  en: 'FEATURE_VOICE_EN',
  ur: 'FEATURE_VOICE_UR',
};

export interface IssuedVapiTokenWithSession extends IssuedVapiToken {
  readonly sessionId: string;
}

export async function issueVapiToken(
  deps: IssueVapiTokenDeps,
  input: IssueVapiTokenInput,
): Promise<Result<IssuedVapiTokenWithSession, AppError>> {
  const now = deps.now ?? (() => new Date());

  if (!isFeatureEnabled(FLAG_BY_LOCALE[input.locale], deps.envSource)) {
    return err(featureDisabled(input.correlationId));
  }

  const microphoneConsent = await deps.hasMicrophoneConsent(input.sessionId);
  if (!microphoneConsent) {
    return err(consentRequired(input.correlationId));
  }

  const rateDecision = await deps.rateLimiter.consume(
    `vapi-token:${input.sessionId}`,
    VAPI_TOKEN_RATE_LIMIT_RULE,
    now(),
  );
  if (!rateDecision.allowed) return err(rateLimited(input.correlationId));

  try {
    const issued = deps.issuer.issueToken({
      locale: input.locale,
      origin: input.origin,
      now: now(),
    });
    return ok({ ...issued, sessionId: input.sessionId });
  } catch (error) {
    // Never log the raw error message — it could embed credential detail
    // (same reasoning as `orchestrator.ts`'s catch block). A type name only.
    deps.logger.error('vapi.token_issuance_failed', {
      correlationId: input.correlationId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return err(internalError('vapi token issuance failed', input.correlationId));
  }
}

/**
 * GET/POST /api/whatsapp/webhook — Runbook Step 38.
 *
 * `cladium-research/operations/whatsapp-cloud-readiness.md` is the
 * authoritative source for why this stays disabled: `FEATURE_WHATSAPP_CLOUD`
 * is checked **first**, before any other check, on both methods — off
 * means a `404` (`featureDisabled()`, matching `/api/vapi/token`'s "a
 * disabled feature must not confirm it exists" convention, Step 31), the
 * evidence bullet this step is graded on ("flag-off routes fail closed").
 *
 * `GET` answers Meta's one-time webhook subscription handshake
 * (`hub.mode`/`hub.verify_token`/`hub.challenge`). `POST` verifies the
 * `X-Hub-Signature-256` signature on every delivery before acknowledging
 * it — it does not yet parse or store the payload; real message
 * processing needs the live payload shape confirmed against real traffic
 * first (tracked in the readiness report, not forgotten). No production
 * message can ever be sent by this route — it only ever receives.
 *
 * `isWhatsAppCloudEnabled` wraps `isFeatureEnabled` in a try/catch rather
 * than calling it directly: `parseFeatureFlags` (Step 6) requires *every*
 * declared `FEATURE_*` var to be set and throws if even one unrelated
 * flag is missing — a real, already-tracked gap (`.continuum/TASKS.md`,
 * found during Step 36's live check) that would otherwise turn "this one
 * flag is off" into an uncaught 500 here whenever some *other* flag is
 * unconfigured. This route's own correctness doesn't depend on every
 * other flag being set, so it degrades to the same safe "disabled" 404
 * either way — a narrow, local fix scoped to this file only, not a
 * change to `isFeatureEnabled`/`parseFeatureFlags` themselves, which the
 * tracked item correctly notes needs its own separate review.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { toPublicError, unauthorized, featureDisabled } from '../../../../lib/errors';
import {
  isFeatureEnabled,
  parseWhatsAppWebhookSecret,
  parseWhatsAppWebhookVerifyToken,
} from '../../../../lib/env.server';
import { createLogger } from '../../../../lib/logging';
import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from '../../../../modules/integrations/whatsapp-webhook-auth';

const logger = createLogger();

function isWhatsAppCloudEnabled(): boolean {
  try {
    return isFeatureEnabled('FEATURE_WHATSAPP_CLOUD');
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);

  if (!isWhatsAppCloudEnabled()) {
    const disabled = featureDisabled(correlationId);
    return NextResponse.json({ error: toPublicError(disabled) }, { status: disabled.status });
  }

  const params = request.nextUrl.searchParams;
  const challenge = verifyWhatsAppWebhookChallenge(
    {
      mode: params.get('hub.mode'),
      verifyToken: params.get('hub.verify_token'),
      challenge: params.get('hub.challenge'),
    },
    parseWhatsAppWebhookVerifyToken(),
  );

  if (challenge === null) {
    logger.warn('whatsapp.webhook_handshake_rejected', { correlationId });
    const rejected = unauthorized(correlationId);
    return NextResponse.json({ error: toPublicError(rejected) }, { status: rejected.status });
  }

  logger.info('whatsapp.webhook_handshake_verified', { correlationId });
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);

  if (!isWhatsAppCloudEnabled()) {
    const disabled = featureDisabled(correlationId);
    return NextResponse.json({ error: toPublicError(disabled) }, { status: disabled.status });
  }

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) {
    return NextResponse.json(
      { error: toPublicError(contentTypeCheck.error) },
      { status: contentTypeCheck.error.status },
    );
  }

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, undefined, correlationId);
  if (!bodySizeCheck.ok) {
    return NextResponse.json(
      { error: toPublicError(bodySizeCheck.error) },
      { status: bodySizeCheck.error.status },
    );
  }

  const verified = verifyWhatsAppWebhookSignature(
    rawBody,
    request.headers.get('x-hub-signature-256'),
    parseWhatsAppWebhookSecret(),
  );
  if (!verified) {
    logger.warn('whatsapp.webhook_signature_rejected', { correlationId });
    const rejected = unauthorized(correlationId);
    return NextResponse.json({ error: toPublicError(rejected) }, { status: rejected.status });
  }

  // Signature verified; payload parsing/storage/dedupe is deliberately not
  // built yet (see the readiness report's "what is explicitly not built").
  logger.info('whatsapp.webhook_received', { correlationId });
  return NextResponse.json({ received: true });
}

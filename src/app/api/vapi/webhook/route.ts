/**
 * POST /api/vapi/webhook — Runbook Step 32.
 *
 * Generic call-lifecycle events (call started/ended, transcript, end-of-
 * call report, etc.) — distinct from `/api/vapi/tools`'s function-call
 * execution. Authenticated identically (same HMAC/timestamp/replay check,
 * `modules/voice/webhook-auth.ts`), but deliberately does nothing with the
 * event yet beyond acknowledging it: nothing downstream consumes a
 * call-lifecycle event today (no call-record persistence has been asked
 * for, and `conversation_summaries` was explicitly not created — Step 9),
 * matching this codebase's repeated "build the verified/authenticated
 * layer now, wire real handling once there's a reason to" pattern (Step 26
 * shipped tools with no caller yet; Step 27 shipped orchestration with no
 * UI yet). Only the event `type` is logged — redacted-safe, never the
 * event body itself, which could carry a transcript or other guest speech
 * content.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { toPublicError, unauthorized, validationFailed } from '../../../../lib/errors';
import { vapiGenericEventSchema } from '../../../../modules/integrations/vapi-webhook';
import { verifyVapiWebhookRequest } from '../../../../modules/voice/webhook-auth';
import { vapiWebhookReplayStore, voiceLogger } from '../../../../modules/voice/deps';

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);

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

  const authResult = await verifyVapiWebhookRequest({
    rawBody,
    timestampHeader: request.headers.get('x-vapi-timestamp'),
    signatureHeader: request.headers.get('x-vapi-signature'),
    replayStore: vapiWebhookReplayStore,
  });
  if (!authResult.ok) {
    voiceLogger.warn('vapi.webhook_rejected', { correlationId, reason: authResult.reason });
    const rejected = unauthorized(correlationId);
    return NextResponse.json({ error: toPublicError(rejected) }, { status: rejected.status });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    const malformed = validationFailed([{ path: '(body)', code: 'invalid_json' }], correlationId);
    return NextResponse.json({ error: toPublicError(malformed) }, { status: malformed.status });
  }

  const bodyResult = vapiGenericEventSchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    const malformed = validationFailed([{ path: '(body)', code: 'invalid_shape' }], correlationId);
    return NextResponse.json({ error: toPublicError(malformed) }, { status: malformed.status });
  }

  voiceLogger.info('vapi.webhook_received', { correlationId, type: bodyResult.data.message.type });
  return NextResponse.json({ received: true });
}

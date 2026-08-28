/**
 * POST /api/vapi/tools — Runbook Step 32.
 *
 * Server-to-server from Vapi, not a guest's browser — there is no session
 * cookie/CSRF token here, unlike every guest-mutating route since Step 20.
 * Authentication is entirely the HMAC/timestamp/replay check
 * (`modules/voice/webhook-auth.ts`), the same class of guard
 * `/api/cron/outbox-dispatch` (Step 25) uses for its own non-session
 * caller. The response shape (`{results: [...]}`) is Vapi's own contract,
 * not this codebase's usual `{value}`/`{error}` envelope — built directly
 * rather than through `respondResult`.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { toPublicError, unauthorized, validationFailed } from '../../../../lib/errors';
import { parseVapiCredentials } from '../../../../lib/env.server';
import {
  buildVapiToolCallResponse,
  localeForAssistantId,
  sessionIdForCall,
  vapiToolCallWebhookSchema,
} from '../../../../modules/integrations/vapi-webhook';
import { verifyVapiWebhookRequest } from '../../../../modules/voice/webhook-auth';
import { executeVapiToolCalls } from '../../../../modules/voice/tools/execute-vapi-tool-calls';
import {
  executeVapiToolCallsDeps,
  vapiWebhookReplayStore,
  voiceLogger,
} from '../../../../modules/voice/deps';

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
    voiceLogger.warn('vapi.tools_webhook_rejected', { correlationId, reason: authResult.reason });
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

  const bodyResult = vapiToolCallWebhookSchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    const malformed = validationFailed([{ path: '(body)', code: 'invalid_shape' }], correlationId);
    return NextResponse.json({ error: toPublicError(malformed) }, { status: malformed.status });
  }

  const { toolCallList, call } = bodyResult.data.message;

  let locale: 'en' | 'ur' = 'en';
  try {
    locale = localeForAssistantId(call.assistantId, parseVapiCredentials());
  } catch (error) {
    voiceLogger.error('vapi.tools_webhook_locale_resolution_failed', {
      correlationId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
  }

  const sessionId = sessionIdForCall(call.id, call);

  const results = await executeVapiToolCalls(executeVapiToolCallsDeps, {
    toolCallList,
    sessionId,
    locale,
    correlationId,
  });

  return NextResponse.json(buildVapiToolCallResponse(results));
}

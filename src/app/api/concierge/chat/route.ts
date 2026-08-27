/**
 * POST /api/concierge/chat — Runbook Step 27.
 *
 * Thin glue over `orchestrateTurn`: session/CSRF/origin-guarded exactly
 * like every other guest-mutating route since Step 20 (`parseMutatingRequest`),
 * so the concierge is authenticated the same way the takeaway/booking/
 * event flows are — never a separate, weaker guard. `locale` and
 * `message` are the only guest-controlled inputs; everything else the
 * orchestrator needs (prior conversation, rate-limit state) is
 * server-resolved from the verified session.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import { orchestratorDeps } from '../../../../modules/concierge/deps';
import { chatMessageBodySchema } from '../../../../modules/concierge/schemas';
import { orchestrateTurn } from '../../../../modules/concierge/orchestrator';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, chatMessageBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const turnResult = await orchestrateTurn(orchestratorDeps, {
    sessionId,
    locale: body.locale,
    userMessage: body.message,
    correlationId,
  });
  return respondResult(turnResult, { setCookieHeader });
}

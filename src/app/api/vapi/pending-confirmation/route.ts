/**
 * GET /api/vapi/pending-confirmation — Runbook Step 33.
 *
 * Read-only, session-cookie-authenticated exactly like `GET /api/session/
 * csrf` (Step 22) — no CSRF token needed for a GET that changes nothing.
 * `voice-panel.tsx` polls this while a call is active, using the same
 * guest session id it already bootstrapped and passed to Vapi as
 * `assistantOverrides.metadata.sessionId` at call-start — so a draft
 * `/api/vapi/tools` (Step 32) prepared for that session becomes visible to
 * the tab that started the call, the same "poll the durable server-side
 * result" bridge Step 25 established for staff notifications.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveSessionContext } from '../../../../lib/http/session-route';
import { ok } from '../../../../lib/result';
import { pendingConfirmationStore } from '../../../../modules/voice/deps';

export async function GET(request: NextRequest) {
  const sessionResult = resolveSessionContext({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
  });
  if (!sessionResult.ok) return respondResult(sessionResult);

  const { sessionId, setCookieHeader } = sessionResult.value;
  const pendingConfirmation = pendingConfirmationStore.get(sessionId, new Date());
  return respondResult(ok({ pendingConfirmation }), { setCookieHeader });
}

/**
 * POST /api/telemetry/vitals — real Core Web Vitals field samples from real
 * devices, closing item 6 of Step 45's punch list
 * (`production-readiness-decision.md`, D-049; Gate 7's "real P75 field
 * telemetry", never captured before this route existed).
 *
 * ## Why this route does not use `parseMutatingRequest`
 *
 * Every other guest-mutating route in this codebase goes through
 * `lib/http/mutating-route.ts`, and sharing that helper would normally be
 * the right instinct. It is the wrong fit here for one specific reason:
 * that helper resolves (and, for a first-time visitor, *mints*) a guest
 * session cookie, because a CSRF token is derived from a session id.
 *
 * Minting a session for every visitor purely so their browser may report a
 * page-load timing would mean this feature collects a durable per-visitor
 * identifier — more about that guest than the telemetry itself does, and the
 * opposite of `CLAUDE.md`'s "make customer data collection minimal". It
 * would also change observable behavior for guests who never interact with
 * anything: today a visitor who only reads the menu carries no session
 * cookie at all, and adding telemetry must not quietly end that.
 *
 * So this route substitutes a different, narrower guard and accepts the
 * trade honestly:
 *
 *   * **Trusted-origin check** (`checkRequestOrigin`, the same module and
 *     allowlist `guardStateChangingRequest` uses) — fails closed if
 *     `NEXT_PUBLIC_APP_URL` is unconfigured, exactly as the CSRF guard
 *     does. A cross-site page cannot post here.
 *   * **Feature flag first**, before anything else including body parsing,
 *     so a disabled feature does not confirm it exists (`errors.ts#
 *     featureDisabled`).
 *   * **Content-type and body-size caps** from the same shared module.
 *   * **A global rate ceiling** — see below.
 *   * **A strict schema** whose every field is a closed set or bounded
 *     number, and whose open-ended fields are normalized away server-side
 *     before storage (`modules/telemetry/vitals-sample.ts`).
 *
 * What this genuinely does not have, stated plainly rather than implied: an
 * origin header is trivially forgeable by a non-browser client. A script can
 * post fabricated samples and skew a percentile. The mitigations are the
 * value bounds, the closed enums, and the ceiling below — not authentication.
 * That is an acceptable exposure for anonymous performance measurement whose
 * worst-case outcome is a misleading dashboard number, and it would not be
 * acceptable for anything that creates a staff-visible record. Worth
 * revisiting if this table ever informs an automated decision.
 *
 * ## The rate limit is global, and that is a real trade-off
 *
 * Every other rule in `route-rate-limits.ts` keys off a session id. With no
 * session there is nothing per-visitor to key on: the only candidate is
 * client IP via `x-forwarded-for`, and `STAFF_SIGNIN_RATE_LIMIT_RULE`'s own
 * comment already records why this project does not yet trust that header
 * for a security control (its real shape behind Vercel has never been
 * verified, and an unverified guest-suppliable header is a false sense of
 * protection). So the ceiling here is one shared bucket for the whole route.
 *
 * The consequence: one abusive client can exhaust the window and cause
 * *sample loss* for everyone until it resets. That is the right failure to
 * choose — it protects the database from an insert flood, and the thing lost
 * is telemetry, never a guest's ability to use the site. It is deliberately
 * not a security boundary.
 *
 * ## 202, and an empty body
 *
 * The response carries nothing. A client has no decision to make with the
 * outcome (the reporter below fires and forgets, and `sendBeacon` cannot read
 * a response at all), and returning whether a sample was stored would leak
 * whether the flag is on and whether the database is reachable. 202 says
 * "accepted, nothing to collect" honestly.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { parseAppUrl } from '../../../../lib/env';
import { isFeatureEnabled } from '../../../../lib/env.server';
import {
  featureDisabled,
  forbidden,
  rateLimited,
  toPublicError,
  validationFailed,
  type AppError,
} from '../../../../lib/errors';
import { createLogger } from '../../../../lib/logging';
import {
  guestRouteRateLimiter,
  VITALS_REPORT_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { checkRequestOrigin, trustedOriginConfig } from '../../../../lib/security/origin';
import { parseAtBoundary } from '../../../../lib/schemas/parse';
import { recordVitalsSample } from '../../../../modules/telemetry/record-vitals-sample';
import { reportVitalsBodySchema } from '../../../../modules/telemetry/schemas';
import { webVitalsSampleStore } from '../../../../modules/telemetry/deps';

/** One shared bucket for the whole route — see the doc comment on why there is no per-visitor key. */
const RATE_LIMIT_KEY = 'telemetry-vitals:all';

/** A beacon body is a handful of short fields; the default 32 KiB cap is far more headroom than it needs. */
const MAX_BEACON_BODY_BYTES = 2 * 1024;

function reject(error: AppError): NextResponse {
  return NextResponse.json({ error: toPublicError(error) }, { status: error.status });
}

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);

  if (!isFeatureEnabled('FEATURE_FIELD_TELEMETRY')) {
    return reject(featureDisabled(correlationId));
  }

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) return reject(contentTypeCheck.error);

  let appOrigin: string;
  try {
    appOrigin = new URL(parseAppUrl()).origin;
  } catch {
    // Fails closed, same as `guardStateChangingRequest`: an unconfigured
    // trusted origin must block the write, not skip the check.
    return reject(forbidden(correlationId));
  }
  const originCheck = checkRequestOrigin(
    { origin: request.headers.get('origin'), referer: request.headers.get('referer') },
    trustedOriginConfig([appOrigin]),
  );
  if (!originCheck.trusted) return reject(forbidden(correlationId));

  const decision = await guestRouteRateLimiter.consume(
    RATE_LIMIT_KEY,
    VITALS_REPORT_RATE_LIMIT_RULE,
  );
  if (!decision.allowed) return reject(rateLimited(correlationId));

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, MAX_BEACON_BODY_BYTES, correlationId);
  if (!bodySizeCheck.ok) return reject(bodySizeCheck.error);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return reject(validationFailed([{ path: '(body)', code: 'invalid_json' }], correlationId));
  }

  const bodyResult = parseAtBoundary(reportVitalsBodySchema, parsedJson, correlationId);
  if (!bodyResult.ok) return reject(bodyResult.error);

  await recordVitalsSample(
    {
      store: webVitalsSampleStore,
      isFeatureEnabled: () => isFeatureEnabled('FEATURE_FIELD_TELEMETRY'),
      logger: createLogger({ correlationId }),
    },
    bodyResult.value,
  );

  // Deliberately empty — see the doc comment on why the outcome is not reported.
  return new NextResponse(null, { status: 202 });
}

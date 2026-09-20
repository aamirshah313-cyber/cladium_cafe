/**
 * Process-lifetime deps for Meta event tracking — Runbook Step 37. Same
 * shape as `modules/voice/deps.ts`'s `voiceTokenDeps`: a real, never-
 * live-called adapter (`createMetaEventClient`), `isFeatureEnabled` bound
 * to `FEATURE_META_MARKETING`, and `hasConsent` bound to `META_MARKETING`
 * — every trigger site imports this one singleton rather than assembling
 * its own deps, so the flag/consent binding can never drift between call
 * sites.
 */

import { isFeatureEnabled } from '../../lib/env.server';
import { createLogger } from '../../lib/logging';
import { hasConsent } from '../consent/consent-service';
import { consentDeps } from '../consent/deps';
import { createMetaEventClient } from './meta-client';
import type { TrackMetaEventDeps } from './meta-events';
import { recordOperationalOccurrenceAsync } from '../alerting/record-operational-occurrence';
import { alertStore } from '../alerting/deps';

export const metaEventsDeps: TrackMetaEventDeps = {
  client: createMetaEventClient(),
  isFeatureEnabled: () => isFeatureEnabled('FEATURE_META_MARKETING'),
  hasConsent: (sessionId) => hasConsent(consentDeps, sessionId, 'META_MARKETING'),
  logger: createLogger(),
  /**
   * Operational counters for the alert thresholds (item 8 of D-049's punch
   * list). Fire-and-forget: `recordOperationalOccurrenceAsync` swallows
   * every failure, so a counter outage can never surface here.
   */
  recordOccurrence: (kind, label, outcome) =>
    recordOperationalOccurrenceAsync(
      { store: alertStore, logger: createLogger() },
      kind,
      label,
      outcome,
    ),
};

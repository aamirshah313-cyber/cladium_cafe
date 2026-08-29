/**
 * Meta Conversions API (CAPI) adapter — Runbook Step 37 (ADR-0008: a thin
 * interface plus one real adapter isolated in one file, so a provider swap
 * or a corrected request shape touches only this module).
 *
 * **No live `META_CONVERSIONS_API_TOKEN`/`META_DATASET_ID` exist in this
 * sandbox — `.env.example` ships them empty and `FEATURE_META_MARKETING`
 * stays `false` — so this has never been verified against the real Meta
 * Graph API.** The request shape below (`POST /{dataset_id}/events` with a
 * `data: [...]` array, `action_source: 'website'`, `event_id` for
 * browser/CAPI dedupe) is Meta's own documented Conversions API contract,
 * not a guess the way `vapi-client.ts`'s JWT claims were before Step 33 —
 * but confirm it against Meta's current API docs before this ever handles
 * a real event (tracked in `.continuum/TASKS.md`, same standing-limitation
 * shape as every other unverified third-party integration here).
 *
 * `createMetaEventClient()` never throws at construction — the same "fail
 * only when actually used" shape as `createVapiTokenIssuer`/
 * `createAnthropicChatClient`: credentials are read lazily inside
 * `sendEvent`, so importing this module can never crash an unrelated
 * route. The caller (`meta-events.ts`) depends on the `MetaEventClient`
 * interface only, never this shape directly.
 */

import { assertServerOnly } from '../../lib/server-only';
import { parseMetaCredentials } from '../../lib/env.server';
import type { MetaEventName } from '../../lib/schemas/common';

assertServerOnly('src/modules/integrations/meta-client.ts');

type EnvSource = Record<string, string | undefined>;

const META_GRAPH_API_VERSION = 'v21.0';

export interface MetaEventPayload {
  readonly eventName: MetaEventName;
  /** Shared between the browser Pixel call and this CAPI call for Meta-side dedupe. */
  readonly eventId: string;
  readonly occurredAt: Date;
  /** A safe, non-PII page path only — never a query string that could carry guest data. */
  readonly eventSourceUrl?: string;
}

export interface MetaEventClient {
  sendEvent(payload: MetaEventPayload): Promise<void>;
}

function buildRequestBody(payload: MetaEventPayload): unknown {
  return {
    data: [
      {
        event_name: payload.eventName,
        event_id: payload.eventId,
        event_time: Math.floor(payload.occurredAt.getTime() / 1000),
        action_source: 'website',
        ...(payload.eventSourceUrl ? { event_source_url: payload.eventSourceUrl } : {}),
      },
    ],
  };
}

export function createMetaEventClient(envSource: EnvSource = process.env): MetaEventClient {
  return {
    async sendEvent(payload) {
      const credentials = parseMetaCredentials(envSource);
      if (!credentials) {
        // Fail closed: no configured credentials means nothing is ever sent.
        throw new Error('Meta credentials are not configured');
      }

      const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${credentials.datasetId}/events?access_token=${encodeURIComponent(credentials.conversionsApiToken)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(payload)),
      });

      if (!response.ok) {
        throw new Error(`Meta Conversions API responded with status ${response.status}`);
      }
    },
  };
}

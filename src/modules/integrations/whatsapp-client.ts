/**
 * WhatsApp Cloud API outbound adapter — Runbook Step 38 (ADR-0008: a thin
 * interface plus one real adapter isolated in one file).
 *
 * **A pure, tested, unused-by-design scaffold.** No route or trigger in
 * this codebase calls `sendTemplateMessage` — `cladium-research/
 * operations/whatsapp-cloud-readiness.md` is the authoritative source for
 * why: `FEATURE_WHATSAPP_CLOUD` stays `false` until every prerequisite
 * there (business-owned WABA, Meta template approval, opt-in/opt-out, a
 * live payload-shape check) passes owner review. No live
 * `WHATSAPP_ACCESS_TOKEN` exists in this sandbox, so this has never been
 * verified against the real Meta Graph API — same standing limitation as
 * `vapi-client.ts` before Step 33 and `meta-client.ts` (Step 37). The
 * request shape below (`POST /{phone_number_id}/messages`, `messaging_
 * product: 'whatsapp'`, `type: 'template'`) is Meta's own documented
 * Cloud API contract, not a guess.
 *
 * `createWhatsAppCloudClient()` never throws at construction — the same
 * "fail only when actually used" shape every adapter here uses:
 * credentials are read lazily inside `sendTemplateMessage`, so importing
 * this module can never crash an unrelated route.
 */

import { assertServerOnly } from '../../lib/server-only';
import { parseWhatsAppCredentials } from '../../lib/env.server';

assertServerOnly('src/modules/integrations/whatsapp-client.ts');

type EnvSource = Record<string, string | undefined>;

const WHATSAPP_GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppTemplateComponent {
  readonly type: 'body' | 'header' | 'button';
  readonly parameters: readonly { readonly type: 'text'; readonly text: string }[];
}

export interface WhatsAppTemplateMessage {
  /** E.164, digits only, no leading `+` (Meta's own convention) — e.g. `923123978889`. */
  readonly toPhoneNumber: string;
  /** Must already be a Meta-approved template name — this adapter has no opinion on approval status. */
  readonly templateName: string;
  readonly languageCode: string;
  readonly components?: readonly WhatsAppTemplateComponent[];
}

export interface WhatsAppCloudClient {
  sendTemplateMessage(message: WhatsAppTemplateMessage): Promise<void>;
}

function buildRequestBody(message: WhatsAppTemplateMessage): unknown {
  return {
    messaging_product: 'whatsapp',
    to: message.toPhoneNumber,
    type: 'template',
    template: {
      name: message.templateName,
      language: { code: message.languageCode },
      ...(message.components ? { components: message.components } : {}),
    },
  };
}

export function createWhatsAppCloudClient(envSource: EnvSource = process.env): WhatsAppCloudClient {
  return {
    async sendTemplateMessage(message) {
      const credentials = parseWhatsAppCredentials(envSource);
      if (!credentials) {
        // Fail closed: no configured credentials means nothing is ever sent.
        throw new Error('WhatsApp Cloud API credentials are not configured');
      }

      const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${credentials.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body: JSON.stringify(buildRequestBody(message)),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp Cloud API responded with status ${response.status}`);
      }
    },
  };
}

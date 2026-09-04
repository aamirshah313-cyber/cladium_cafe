# Deployment target - Vercel Pro and Vapi

## Decision

The selected production deployment is a **Next.js application on Vercel Pro**, **Supabase Pro**, and **Vapi browser voice**. Netlify is technically compatible but is not the implementation target. Keep domain logic behind adapters so a future migration remains possible.

Vercel Pro is required for the public commercial café site. The Vercel Hobby plan is personal/non-commercial. Set a spending alert before the public launch and review usage monthly.

## Environment separation

Create three isolated configurations:

| Environment | Purpose | Rule |
| --- | --- | --- |
| Development | local development | local/dev Supabase, test data, and non-production credentials |
| Preview / staging | pull-request and release review | isolated Supabase project, Vapi assistants/signing key, Anthropic key, flags, and webhook URLs |
| Production | approved Cladium domain | production-only Supabase project, secrets, flags, and approved assistant versions |

Environment values are configured in the Vercel dashboard or CLI and never committed. Changing a Vercel environment value requires a new deployment before it is used.

## Required secret inventory

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | server only | text concierge model calls |
| `DATABASE_URL` | server only | pooled PostgreSQL application connection |
| `DIRECT_DATABASE_URL` | migration job only | controlled direct/session migration connection |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | environment-specific Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | publishable/anonymous key; RLS remains mandatory |
| `SUPABASE_SERVICE_ROLE_KEY` | server/worker only | privileged operations; never used in client code |
| `SESSION_SECRET` | server only | signed session/request protection |
| `VAPI_ORG_ID` | server only | public JWT claims/organization scope |
| `VAPI_PRIVATE_KEY` | server only | short-lived public JWT issuance and controlled Vapi operations |
| `VAPI_ASSISTANT_EN_ID` | server only | allowlisted English assistant |
| `VAPI_ASSISTANT_UR_ID` | server only | allowlisted Urdu assistant |
| `VAPI_WEBHOOK_HMAC_SECRET` | server only | Vapi Custom Credential HMAC verification |
| `CRON_SECRET` | server only | authenticated outbox/retention jobs |
| Meta/WhatsApp variables | server only | future business-owned integrations |

Do not use `NEXT_PUBLIC_` for any private key, database/service-role credential, Anthropic key, Meta token, WhatsApp token, Vapi signing/private key, HMAC secret, or assistant allowlist. Do not use a long-lived `NEXT_PUBLIC_VAPI_PUBLIC_KEY` as the production browser-authentication strategy.

## Vapi boundaries

1. Launch only the website voice experience using Vapi Web SDK; it does not require a telephone number.
2. The browser requests `/api/vapi/token`; the server returns a short-lived public JWT restricted to the verified origin and selected environment-specific English/Urdu assistant.
3. Place Vapi webhook and server-tool endpoints behind Vercel Node.js route handlers. Verify Vapi Custom Credential HMAC-SHA256, timestamp freshness, replay state, and schema before invoking any tool.
4. Use Vapi `toolCallId` for deduplication/idempotency. Do not let a client-side tool persist data or calculate totals. Server tools invoke the same deterministic contracts used by text chat.
5. Voice can prepare a draft, but the customer submits only through a visible website review and explicit tap. Recording is disabled by default.
6. A Vapi phone number is a later phase. A Pakistan-compatible carrier/SIP provider must be separately researched and approved. This phase may not use Twilio unless the owner explicitly changes the decision.

## Vercel route outline

```text
app/
  api/
    chat/route.ts                 # text concierge
    vapi/
      token/route.ts              # short-lived restricted public JWT
      webhook/route.ts            # validate Vapi events
      tools/route.ts              # HMAC/replay/idempotent server tool execution
    takeaway/...                  # draft, review-token, request submission
    bookings/...                  # request-only capture/status
    events/...                    # event enquiry/request capture
    staff/...                     # protected staff actions
```

Use Node.js server runtime for routes that need secrets, database access, or signature verification. Keep approved static media on the Vercel CDN or Supabase Storage. Select the Supabase database region first, then place Vercel functions nearby. Use the Supabase transaction pooler for serverless request traffic; restrict direct/session connections to migration/administrative workflows.

### Function and database regions

Vercel Functions default to `iad1` (Washington, D.C.) for every new project. That default was left in place through the Step 43 staging release while the Supabase project was created in `ap-northeast-1` (Tokyo) — roughly 11,000 km apart, with every sequential database round-trip in a request paying that distance. This violated the co-location rule stated in the paragraph above.

`vercel.json` now pins `"regions": ["hnd1"]`. Vercel's `hnd1` **is** AWS `ap-northeast-1`, so functions execute in the same AWS region as the database. A single region is permitted on every plan including Hobby (Pro allows 5), so this applies now and does not depend on the Pro upgrade.

| Purpose | Vercel code | AWS region |
| --- | --- | --- |
| Current database + functions | `hnd1` | `ap-northeast-1` (Tokyo) |
| Nearest region to Abbottabad | `bom1` | `ap-south-1` (Mumbai) |

Open decision for the owner, deliberately not actioned here: Tokyo is about 6,000 km from Abbottabad, while Mumbai is roughly 1,500–2,000 km. Moving **both** tiers to Mumbai would cut guest-facing latency substantially while keeping function and database co-located. Supabase cannot change an existing project's region in place — it requires creating a new project in `ap-south-1` and restoring, so this is an owner decision, not a config edit. It is far cheaper to do now, while the project holds only staging test data, than after production data exists. If the region is moved, update `vercel.json` to `bom1` in the same change so the two tiers never drift apart again.

## Deployment gates

Before deployment, verify:

- production Supabase Pro PostgreSQL, RLS, MFA policy, storage, Realtime, transaction pooler, backups, and tested restore are configured;
- production secrets are present only in Vercel;
- Vapi browser JWT is short-lived and origin/assistant restricted; no private or unrestricted long-lived key ships to the browser;
- webhooks/tools reject unsigned, stale, replayed, duplicate, and invalid requests and log safely without secrets/PII;
- the voice agent passes the same no-delivery, price, booking, and escalation acceptance tests as text chat;
- English/Urdu voice profiles pass the real-speaker mobile bake-off, and voice submissions require visible tap confirmation;
- owner decisions for tax/service charges, payments, staff, data retention, and privacy policy are recorded;
- actual website voice cost and Vapi usage limits are reviewed and a spend alert exists.

The complete launch decision is governed by `operations/release-gates-v2.md`.

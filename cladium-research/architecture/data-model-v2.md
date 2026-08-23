# Production data model and workflow contracts v2

Status: **authoritative domain-data specification**

The database is introduced before functional request flows. JSON files are import sources, fixtures, and research evidence—not production persistence.

## 1. General database rules

- PostgreSQL on Supabase Pro; all timestamps are `timestamptz` in UTC.
- Primary identifiers are UUIDs or sortable UUID-compatible identifiers generated server-side.
- Money is stored as integer PKR; do not use floats.
- User-facing records include `created_at`, `updated_at`, and integer `version` for optimistic concurrency.
- Free-form notes have strict length limits and are excluded from analytics and general application logs.
- Public reads are limited to published, non-sensitive projections. Staff and service writes are protected by RLS plus server authorization.
- Hard deletion of operational records is exceptional; retention/deletion jobs anonymize or remove PII according to the approved schedule.

## 2. Core configuration and content

### `business_settings`

Keyed settings for approved business name, addresses, primary contact channels, location link, currency, and policy references. Sensitive/internal settings are stored separately from public projections.

### `business_hours`

Timezone-aware weekly hours and exceptional closures. The initial verified schedule is 12:00 pm–12:00 am in `Asia/Karachi`, but the application reads published records instead of duplicating the fact in UI code.

### `feature_flags`

Environment-scoped flag name, enabled state, optional configuration, approver, and audit timestamps. Flags cannot bypass authorization.

### Menu tables

- `menu_versions`: source checksum, source references, import time, review status, published time, approver.
- `menu_categories`: stable slug/ID, sort order, publish state.
- `menu_items`: stable item ID, category, canonical name, description, publish state, availability status, dietary claims only when verified.
- `menu_variants`: stable variant ID, item ID, label, integer PKR price, sort order, publish state.
- `translations`: entity type/ID, field, locale, reviewed value, reviewer, review timestamp.
- `media_assets`: owner-approved asset, alt text per locale, rights/source, dimensions, checksum, focal data, publish state.
- `pricing_rules`: versioned, owner-approved tax/service/discount rules with effective dates. Empty is valid.
- `promotions`: scheduled, approved campaign content and deterministic conditions. Empty is valid.

`availability_status` is an enum: `AVAILABLE`, `UNAVAILABLE`, `UNKNOWN`. The importer defaults missing source availability to `UNKNOWN`.

## 3. Guest and draft data

### `customer_sessions`

Opaque session identifier, locale, theme preference, consent references, creation/expiry, and abuse/rate-limit metadata. Browser cookie contains only a signed opaque token and is `HttpOnly`, `Secure`, and `SameSite=Lax` where applicable.

### `carts` and `cart_items`

Short-lived takeaway drafts. Items reference a published menu version and variant. The server validates quantities and recomputes totals; client totals are display hints only.

### `confirmation_tokens`

Store a hash—not the raw token—with session ID, action type, review payload hash, expiry, used time, and issuance context. Tokens are single-use and invalidated when the reviewed draft changes.

### `idempotency_keys`

Scoped to actor/session plus operation. Store request fingerprint, result reference, status, and expiry. Reusing a key with a different fingerprint is rejected.

## 4. Submitted records

### `takeaway_requests`

Guest contact fields, desired collection detail, current takeaway state, integer subtotal/adjustments/total, menu version, version, source channel, assigned staff, and timestamps.

### `takeaway_items`

Immutable snapshot fields: menu item ID when available, canonical item name, selected variant/add-ons, unit price in integer PKR, quantity, and line total. Historical lines do not change when the menu changes.

### `booking_requests`

Guest contact, requested date/time, party size, seating preference (`GENERAL` or `TREEHOUSE`), notes, current booking state, version, source channel, assigned staff, and timestamps. A requested time is not availability.

### `event_requests`

Guest contact, event type/date/time, guests, décor request, current event state, quoted integer PKR amount when staff supplies it, version, source channel, assigned staff, and timestamps. The public starting décor statement does not create or guarantee a quote.

## 5. State machines

Only listed transitions are legal. Staff permissions may further narrow them.

### Takeaway

```text
DRAFT → REQUESTED → ACCEPTED → PREPARING → READY → COLLECTED
                    └──────────────→ REJECTED
REQUESTED/ACCEPTED/PREPARING → CANCELLED (subject to staff policy)
```

Customer submission creates `REQUESTED`; it never creates `ACCEPTED` or `CONFIRMED`.

### Booking

```text
DRAFT → REQUESTED → CONFIRMED → SEATED → COMPLETED
                    └────────→ DECLINED
REQUESTED/CONFIRMED → CANCELLED
CONFIRMED → NO_SHOW
```

Only authorized staff can set `CONFIRMED`, `DECLINED`, `SEATED`, `COMPLETED`, or `NO_SHOW`.

### Event

```text
ENQUIRY → REQUESTED → QUOTED → CUSTOMER_ACCEPTED → CONFIRMED
   └────────────── applicable pre-confirmation states ─────────→ CANCELLED
```

Only staff can set `QUOTED` and `CONFIRMED`. A customer acceptance is not final confirmation.

## 6. History, authorization, and delivery reliability

### `status_events`

Append-only event with entity type/ID, previous/new state, actor type/ID, reason code/note, request version, timestamp, correlation ID, and safe metadata.

### `staff_profiles` and roles

Profile links Supabase Auth user to status and roles. Initial roles: `OWNER`, `MANAGER`, `ORDER_STAFF`, `BOOKING_STAFF`, `AUDITOR`. Use normalized role membership if users may have multiple roles. MFA policy applies to owner/manager.

### `audit_events`

Append-only records for authentication-sensitive and administrative activity, menu publishing, feature changes, exports, and PII access. Redact secrets and minimize PII.

### `outbox_events`

Written in the same transaction as the business change. Includes event type, entity reference, safe payload, delivery destination, attempt count, next attempt, claimed time, delivered time, and terminal failure. A retry worker uses bounded exponential backoff. Handlers are idempotent.

### `webhook_events`

Provider, provider event/tool-call ID, received timestamp, signature/timestamp validation outcome, processing state, attempt count, safe digest, and expiry. Unique provider/event ID enforces deduplication.

### `consent_events`

Session/customer reference, consent category, policy version, grant/revoke state, timestamp, source, and proof metadata. Categories are distinct: essential preferences, Meta marketing, microphone, and recording.

### Optional `conversation_summaries`

Purpose-limited, redacted summary and expiry—not raw indefinite transcripts. Do not enable until retention purpose and owner-approved notice exist.

## 7. Transaction contracts

### Submit takeaway request

In one transaction:

1. lock/validate the session and confirmation token;
2. verify review hash and idempotency key;
3. reload published menu/version and recompute integer totals;
4. create `takeaway_requests` in `REQUESTED` plus immutable snapshot lines;
5. append status/audit events;
6. mark confirmation token used and persist idempotent result;
7. add staff notification to the outbox.

Booking and event submissions use the same pattern without inventing availability or quotes.

### Staff state transition

In one transaction:

1. authenticate staff and require the applicable role/MFA policy;
2. lock the record and compare expected version;
3. validate the transition and required fields/reason;
4. update current state and version;
5. append status/audit events;
6. add customer/staff notifications to the outbox if permitted.

## 8. API and tool invariants

- All writes use `POST`/`PATCH` with CSRF/origin checks, a strict body schema, and an idempotency key where retry is plausible.
- Public identifiers do not expose sequential counts.
- Read projections reveal only the requesting guest's record or role-authorized staff data.
- Agent tools call domain services, never issue arbitrary SQL.
- Vapi `toolCallId` maps to the idempotency layer.
- Raw provider payloads are not logged; store only required verified fields/digests.
- Database constraints enforce non-negative integer prices, positive quantities/party sizes, allowed states, unique idempotency scopes, and referential integrity.

## 9. Migration and seed policy

- Migrations are immutable, reviewed, and tested against a clean database and a production-like upgrade fixture.
- Seed only approved business/menu fixtures in development and staging. Never seed fake testimonials, ratings, promotions, confirmations, or production customers.
- The production import creates a reviewable unpublished menu version. Owner signoff is required before publishing it.
- Destructive migrations use expand/migrate/contract releases with a verified rollback or restore plan.

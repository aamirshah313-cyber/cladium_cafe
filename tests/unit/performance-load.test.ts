/**
 * Production-like traffic and request-spike load tests — Runbook Step 41
 * (performance and resilience).
 *
 * Every prior concurrency test in this codebase (Steps 21/25/29 etc.)
 * proves *correctness* under a *small* number of genuinely concurrent
 * calls (2, sometimes 3) — enough to catch a real race, never enough to
 * resemble a spike. This file is the first to push the same deterministic
 * services to a *volume* that resembles the runbook step's own wording
 * ("production-like menu traffic, request spikes... database contention")
 * — hundreds of concurrent operations — and to actually measure and
 * report wall-clock timing, not just assert eventual correctness.
 *
 * What this can and cannot prove, honestly: every store here is the
 * in-memory reference adapter (D-023) — there is still no live Postgres/
 * Supabase connection in this sandbox (D-017) to load-test real query
 * planning, connection-pool exhaustion, or lock contention against actual
 * disk-backed storage. What *is* real and load-bearing: the pure
 * orchestration logic — atomic claim/update operations, optimistic-lock
 * conflict resolution, idempotency-key handling, rate-limiter accounting,
 * and the concierge tool-loop bounds — is exactly the code a real adapter
 * would sit behind, unchanged. A production database swap changes the
 * store implementation, never the call pattern these tests exercise.
 * `cladium-research/operations/performance-resilience-report.md` records
 * the actual numbers these tests produce and what remains to be measured
 * against a live environment.
 */
import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import { createInMemoryOutboxStore } from '../../src/lib/domain/outbox-store';
import { buildOutboxEvent } from '../../src/lib/domain/outbox';
import { runDispatchCycle } from '../../src/lib/domain/outbox-dispatcher';
import { createInMemoryRateLimiter } from '../../src/lib/security/rate-limit';
import { emptyCart, addItemToCart, type Cart } from '../../src/modules/takeaway/cart';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
import {
  prepareTakeawayRequest,
  submitTakeawayRequest,
  type TakeawayServiceDeps,
} from '../../src/modules/takeaway/submission-service';
import type {
  TakeawayItemSnapshot,
  TakeawayRequestRecord,
} from '../../src/modules/takeaway/request';
import {
  RATE_LIMIT_RULE,
  orchestrateTurn,
  type OrchestratorDeps,
} from '../../src/modules/concierge/orchestrator';
import { createInMemoryConversationStore } from '../../src/modules/concierge/conversation-store';
import type {
  ChatClient,
  SendMessageResult,
} from '../../src/modules/integrations/anthropic-client';
import type { Logger } from '../../src/lib/logging';
import type { VersionedRecord } from '../../src/lib/domain/versioned-store';
import { createVapiTokenIssuer } from '../../src/modules/integrations/vapi-client';
import { validServerEnv } from '../fixtures/env';

const NOW = () => new Date('2026-08-29T12:00:00Z');

/** Wall-clock timing helper — every load test reports its own number, not just a pass/fail. */
async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await run();
  const elapsedMs = performance.now() - start;

  console.log(`[perf] ${label}: ${elapsedMs.toFixed(1)}ms`);
  return result;
}

const MENU: PublishedMenuView = {
  status: 'PUBLISHED',
  versionNumber: 1,
  categories: [
    {
      id: 'steaks',
      name: 'Steaks',
      items: [
        {
          id: 'steaks.ribeye',
          name: 'Ribeye Steak',
          groupLabel: null,
          availability: 'AVAILABLE',
          basePricePkr: 3500,
          variants: [],
          isSignature: true,
          serves: '1',
          servedWith: null,
        },
      ],
    },
  ],
};

function takeawayHarness() {
  let idCounter = 0;
  const deps: TakeawayServiceDeps = {
    getMenuView: async () => MENU,
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    generateId: () => `id-${++idCounter}`,
    now: NOW,
  };
  return deps;
}

function cartForSession(sessionId: string): Cart {
  const result = addItemToCart(emptyCart(`cart-${sessionId}`, sessionId, 1), MENU, {
    menuItemId: 'steaks.ribeye',
    quantity: 1,
  });
  if (!result.ok) throw new Error('fixture setup failed');
  return result.value;
}

describe('production-like traffic: many distinct guests submitting concurrently', () => {
  it('300 different guests submitting takeaway requests at the same moment: every one succeeds, none collide', async () => {
    const deps = takeawayHarness();
    const GUEST_COUNT = 300;
    const sessionIds = Array.from({ length: GUEST_COUNT }, (_, i) => `session-${i}`);

    // Each guest reviews first (a real guest never submits without one) —
    // still fully concurrent: every review AND every submit fires in the
    // same wave, exactly what a real traffic spike looks like (unlike the
    // existing double-click tests, which replay the *same* guest/token).
    const prepared = await timed('300-guest review (Promise.all)', () =>
      Promise.all(
        sessionIds.map((sessionId) =>
          prepareTakeawayRequest(deps, {
            sessionId,
            cart: cartForSession(sessionId),
            guestName: 'Guest',
            guestPhone: '+923001234567',
          }),
        ),
      ),
    );
    expect(prepared.every((r) => r.ok)).toBe(true);

    const submitted = await timed('300-guest submit (Promise.all)', () =>
      Promise.all(
        sessionIds.map((sessionId, i) => {
          const review = prepared[i];
          if (!review?.ok) throw new Error('fixture setup failed');
          return submitTakeawayRequest(deps, {
            sessionId,
            cart: cartForSession(sessionId),
            guestName: 'Guest',
            guestPhone: '+923001234567',
            sourceChannel: 'WEB',
            confirmationToken: review.value.confirmationToken,
            idempotencyKey: `idem-${sessionId}`,
            correlationId: `corr-${sessionId}`,
          });
        }),
      ),
    );

    expect(submitted.every((r) => r.ok)).toBe(true);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    // Every guest's own request exists, exactly once each — no cross-guest
    // overwrite, no lost write, no double-write.
    expect(requestStore.records.size).toBe(GUEST_COUNT);
    const snapshots = (deps.itemSnapshots as unknown as { events: unknown[] }).events;
    expect(snapshots).toHaveLength(GUEST_COUNT);
  });
});

interface TestOutboxEvent extends VersionedRecord {
  readonly attemptCount: number;
}

describe('production-like traffic: a large outbox backlog drains completely, in order, with no loss or duplication', () => {
  it('500 queued notification events, drained across bounded dispatch cycles: every one delivered exactly once', async () => {
    const store = createInMemoryOutboxStore();
    const EVENT_COUNT = 500;
    let idCounter = 0;

    for (let i = 0; i < EVENT_COUNT; i += 1) {
      await store.append(
        buildOutboxEvent({
          eventType: 'staff_notification',
          entityType: 'TAKEAWAY_REQUEST',
          entityId: `entity-${i}`,
          payload: { entityId: `entity-${i}` },
          destination: 'staff_notification',
          generateId: () => `evt-${++idCounter}`,
          now: NOW,
        }),
      );
    }

    const delivered = new Set<string>();
    const handlers = {
      staff_notification: async (event: { readonly id: string }) => {
        delivered.add(event.id);
      },
    };

    let cycles = 0;
    let totalDelivered = 0;
    const start = performance.now();
    // The dispatcher claims a bounded batch (default 20) per cycle — a
    // real cron-triggered worker (Step 25, `GET /api/cron/outbox-dispatch`)
    // runs exactly this loop, one invocation at a time; this proves it
    // fully drains a spike-sized backlog without ever losing or
    // re-delivering a row.
    for (;;) {
      const summary = await runDispatchCycle({ store, handlers, now: NOW });
      cycles += 1;
      totalDelivered += summary.delivered;
      if (summary.claimed === 0) break;
      if (cycles > EVENT_COUNT) throw new Error('dispatch cycle did not converge — infinite loop');
    }
    const elapsedMs = performance.now() - start;

    console.log(
      `[perf] outbox backlog drain: ${EVENT_COUNT} events, ${cycles} cycles, ${elapsedMs.toFixed(1)}ms total`,
    );

    expect(totalDelivered).toBe(EVENT_COUNT);
    expect(delivered.size).toBe(EVENT_COUNT); // no duplicate delivery
    const all = await store.list();
    expect(all.filter((e) => e.status === 'DELIVERED')).toHaveLength(EVENT_COUNT);
  });

  it('worker overlap under load: two dispatcher instances racing the same 200-event backlog never double-deliver', async () => {
    const store = createInMemoryOutboxStore();
    const EVENT_COUNT = 200;
    let idCounter = 0;
    for (let i = 0; i < EVENT_COUNT; i += 1) {
      await store.append(
        buildOutboxEvent({
          eventType: 'staff_notification',
          entityType: 'TAKEAWAY_REQUEST',
          entityId: `entity-${i}`,
          payload: {},
          destination: 'staff_notification',
          generateId: () => `evt-${++idCounter}`,
          now: NOW,
        }),
      );
    }

    const deliveryCounts = new Map<string, number>();
    const handlers = {
      staff_notification: async (event: { readonly id: string }) => {
        deliveryCounts.set(event.id, (deliveryCounts.get(event.id) ?? 0) + 1);
      },
    };

    // Two "worker instances" each running their own cycles concurrently
    // against the *same* store — `claimBatch`'s atomicity (Step 21's
    // lesson: one conditional operation, never read-then-write) is what
    // this actually tests; a naive read-then-write claim would let both
    // workers see and process the same rows.
    async function drainAsOneWorker() {
      let delivered = 0;
      for (;;) {
        const summary = await runDispatchCycle({ store, handlers, now: NOW, limit: 10 });
        delivered += summary.delivered;
        if (summary.claimed === 0) break;
      }
      return delivered;
    }

    const [workerADelivered, workerBDelivered] = await timed(
      '200-event backlog, 2 concurrent worker instances',
      () => Promise.all([drainAsOneWorker(), drainAsOneWorker()]),
    );

    expect(workerADelivered + workerBDelivered).toBe(EVENT_COUNT);
    expect(deliveryCounts.size).toBe(EVENT_COUNT);
    expect([...deliveryCounts.values()].every((count) => count === 1)).toBe(true);
  });
});

describe('database contention: many staff racing to transition the same record', () => {
  it('50 concurrent transition attempts against one optimistically-locked record: exactly one wins per version, none corrupt the record', async () => {
    const store = createInMemoryVersionedStore<TestOutboxEvent & { id: string }>();
    await store.create({ id: 'order-1', version: 1, attemptCount: 0 });

    const ATTEMPTS = 50;
    const results = await timed('50 concurrent same-record transition attempts', () =>
      Promise.all(
        Array.from({ length: ATTEMPTS }, () =>
          store.updateIfVersionMatches('order-1', 1, { attemptCount: 1 }),
        ),
      ),
    );

    const winners = results.filter((r) => r !== null);
    // Optimistic locking under real contention: every attempt reads the
    // *same* expectedVersion (1) — exactly one write can ever succeed
    // against it, by construction (data-model-v2.md §1). This is the same
    // guarantee `performStaffTransition` (Step 19/24) relies on for every
    // real staff-facing transition; this test just applies enough
    // concurrent pressure to be a genuine stress case, not a two-caller
    // proof.
    expect(winners).toHaveLength(1);
    const final = await store.find('order-1');
    expect(final?.version).toBe(2); // exactly one successful write incremented it once
  });
});

describe('request spikes: the rate limiter holds its exact boundary under a concurrent burst', () => {
  it('200 truly concurrent requests from one guest against a 20/min rule: exactly 20 allowed, 180 rejected — never more, never fewer', async () => {
    const limiter = createInMemoryRateLimiter();
    const rule = { windowMs: 60_000, max: 20 };
    const now = new Date('2026-08-29T12:00:00Z');

    const decisions = await timed('200 concurrent rate-limit checks, one key', () =>
      Promise.all(Array.from({ length: 200 }, () => limiter.consume('guest-burst-1', rule, now))),
    );

    const allowed = decisions.filter((d) => d.allowed);
    expect(allowed).toHaveLength(20);
    expect(decisions.filter((d) => !d.allowed)).toHaveLength(180);
  });
});

function fakeLogger(): Logger {
  const noop = () => {};
  const base = { debug: noop, info: noop, warn: noop, error: noop, logAppError: noop };
  return { ...base, withCorrelationId: () => fakeLogger() };
}

describe('production-like traffic: many distinct concierge sessions chatting concurrently', () => {
  it('150 different guests messaging the concierge at the same moment: every session gets its own isolated reply, no cross-session bleed', async () => {
    const chatClient: ChatClient = {
      async sendMessage(input): Promise<SendMessageResult> {
        // Echoes the session's own last user message back so cross-session
        // bleed would be immediately visible (a wrong session's text
        // appearing in another's reply).
        const lastUserTurn = [...input.messages].reverse().find((m) => m.role === 'user');
        const text = typeof lastUserTurn?.content === 'string' ? lastUserTurn.content : '';
        return {
          content: [{ type: 'text', text: `ack: ${text}` }],
          stopReason: 'end_turn',
          usage: { inputTokens: 50, outputTokens: 20 },
        };
      },
    };
    const deps: OrchestratorDeps = {
      chatClient,
      conversationStore: createInMemoryConversationStore(),
      rateLimiter: createInMemoryRateLimiter(),
      logger: fakeLogger(),
      now: () => new Date('2026-08-29T12:00:00Z'),
    };

    const SESSION_COUNT = 150;
    const sessionIds = Array.from({ length: SESSION_COUNT }, (_, i) => `concierge-session-${i}`);

    const results = await timed('150 concurrent concierge turns, distinct sessions', () =>
      Promise.all(
        sessionIds.map((sessionId) =>
          orchestrateTurn(deps, {
            sessionId,
            locale: 'en',
            userMessage: `unique message from ${sessionId}`,
            correlationId: `corr-${sessionId}`,
          }),
        ),
      ),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    // Every session's own message flows only into its own reply.
    results.forEach((result, i) => {
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.reply).toBe(`ack: unique message from ${sessionIds[i]}`);
    });
    // Well within RATE_LIMIT_RULE (per session) since each session sends
    // exactly one turn — this proves isolation, not the limiter itself
    // (the dedicated rate-limit test above already stresses that).
    expect(RATE_LIMIT_RULE.max).toBeGreaterThanOrEqual(1);
  });
});

describe('production-like traffic: Vapi token issuance throughput', () => {
  it('issues 500 real, independently-signed restricted JWTs in a single Node process and reports real signing throughput', () => {
    // Unlike every other test in this file, this exercises the *real*
    // `createVapiTokenIssuer` (Step 31's hand-rolled RFC 7519 HS256
    // signer, `lib/security/jwt.ts`) — genuine `node:crypto` HMAC work,
    // not an in-memory Map operation. `issueToken` is synchronous, so this
    // measures raw single-process signing throughput directly (Vercel's
    // serverless model runs one request per invocation — this is the
    // per-invocation cost that matters, not artificial parallelism this
    // sandbox has no worker threads to provide anyway).
    const issuer = createVapiTokenIssuer(validServerEnv);
    const TOKEN_COUNT = 500;

    const start = performance.now();
    const tokens = Array.from({ length: TOKEN_COUNT }, () =>
      issuer.issueToken({ locale: 'en', origin: 'https://cladium.example', now: new Date() }),
    );
    const elapsedMs = performance.now() - start;
    const perTokenMs = elapsedMs / TOKEN_COUNT;
    console.log(
      `[perf] ${TOKEN_COUNT} real Vapi JWT issuances: ${elapsedMs.toFixed(1)}ms total, ${perTokenMs.toFixed(3)}ms/token`,
    );

    expect(tokens).toHaveLength(TOKEN_COUNT);
    // Not asserting every signature is distinct: `iat`/`exp` are second-
    // granularity JWT claims (RFC 7519) and this test's own 500 calls
    // complete within a single second, so many genuinely share identical
    // claims and therefore identical signatures — expected and harmless
    // (no `jti`/nonce is needed for this token's security properties,
    // which come from its short TTL and origin/assistant restrictions,
    // not per-call uniqueness). What matters under load is that every
    // call succeeds and returns the correctly-restricted assistant.
    expect(tokens.every((t) => t.assistantId === validServerEnv.VAPI_ASSISTANT_EN_ID)).toBe(true);
  });
});

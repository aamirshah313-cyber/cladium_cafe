import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TOOL_CALLS_PER_WEBHOOK,
  TOOL_CALL_TIMEOUT_MS,
  executeVapiToolCalls,
  type ExecuteVapiToolCallsDeps,
} from '../../src/modules/voice/tools/execute-vapi-tool-calls';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { ok, type Result } from '../../src/lib/result';
import type { AppError } from '../../src/lib/errors';
import type { VapiFunctionCall } from '../../src/modules/integrations/vapi-webhook';

const NOW = new Date('2026-08-29T12:00:00Z');

function toolCall(id: string, name: string, args: Record<string, unknown> = {}): VapiFunctionCall {
  return { id, type: 'function', function: { name, arguments: args } };
}

function buildDeps(overrides: Partial<ExecuteVapiToolCallsDeps> = {}): ExecuteVapiToolCallsDeps {
  return {
    idempotencyStore: createInMemoryIdempotencyStore(),
    now: () => NOW,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('executeVapiToolCalls — real dispatch integration', () => {
  it('dispatches through the real concierge tool registry — same domain service as text chat, not a second implementation', async () => {
    const results = await executeVapiToolCalls(buildDeps(), {
      toolCallList: [toolCall('c1', 'getVenueInfo', { topic: 'HOURS' })],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.result);
    expect(parsed.hours).toBeDefined();
  });

  it('an unknown/hallucinated tool name resolves NOT_FOUND, exactly like text chat', async () => {
    const results = await executeVapiToolCalls(buildDeps(), {
      toolCallList: [toolCall('c1', 'submitBookingRequest')],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });
    const parsed = JSON.parse(results[0]!.result);
    expect(parsed.error).toBeDefined();
  });
});

describe('executeVapiToolCalls — bounded execution', () => {
  it('dispatches at most MAX_TOOL_CALLS_PER_WEBHOOK calls; extras get a bounded-rejection result without ever being dispatched', async () => {
    const dispatched: string[] = [];
    const dispatch: ExecuteVapiToolCallsDeps['dispatch'] = async (name) => {
      dispatched.push(name);
      return ok({});
    };

    const overflowCount = 3;
    const total = MAX_TOOL_CALLS_PER_WEBHOOK + overflowCount;
    const calls = Array.from({ length: total }, (_, i) => toolCall(`c${i}`, 'getMenu'));

    const results = await executeVapiToolCalls(buildDeps({ dispatch }), {
      toolCallList: calls,
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });

    expect(results).toHaveLength(total);
    expect(dispatched).toHaveLength(MAX_TOOL_CALLS_PER_WEBHOOK);

    const overflowResults = results.slice(MAX_TOOL_CALLS_PER_WEBHOOK);
    for (const r of overflowResults) {
      expect(JSON.parse(r.result).error).toContain('Too many tool calls');
    }
    // Every overflow result still carries its own correct toolCallId — an
    // honest per-call answer, never silently dropped.
    expect(overflowResults.map((r) => r.toolCallId)).toEqual(
      calls.slice(MAX_TOOL_CALLS_PER_WEBHOOK).map((c) => c.id),
    );
  });
});

describe('executeVapiToolCalls — toolCallId idempotency', () => {
  it('the same toolCallId with the same arguments is dispatched only once; the replay gets the identical result', async () => {
    let dispatchCount = 0;
    const dispatch: ExecuteVapiToolCallsDeps['dispatch'] = async () => {
      dispatchCount += 1;
      return ok({ callCount: dispatchCount });
    };
    const deps = buildDeps({ dispatch });
    const input = {
      toolCallList: [toolCall('duplicate-id', 'getMenu', { query: 'tea' })],
      sessionId: 'voice:call_1',
      locale: 'en' as const,
      correlationId: 'corr-1',
    };

    const first = await executeVapiToolCalls(deps, input);
    const second = await executeVapiToolCalls(deps, input);

    expect(dispatchCount).toBe(1);
    expect(first[0]!.result).toBe(second[0]!.result);
  });

  it('the same toolCallId reused with different arguments is rejected as a conflict, never silently re-executed or stale-replayed', async () => {
    let dispatchCount = 0;
    const dispatch: ExecuteVapiToolCallsDeps['dispatch'] = async () => {
      dispatchCount += 1;
      return ok({});
    };
    const deps = buildDeps({ dispatch });

    await executeVapiToolCalls(deps, {
      toolCallList: [toolCall('reused-id', 'getMenu', { query: 'tea' })],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });
    const second = await executeVapiToolCalls(deps, {
      toolCallList: [toolCall('reused-id', 'getMenu', { query: 'coffee' })],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });

    expect(dispatchCount).toBe(1);
    expect(JSON.parse(second[0]!.result).error).toBeDefined();
  });

  it('two different toolCallIds for the same underlying call are both dispatched independently', async () => {
    let dispatchCount = 0;
    const dispatch: ExecuteVapiToolCallsDeps['dispatch'] = async () => {
      dispatchCount += 1;
      return ok({});
    };
    const deps = buildDeps({ dispatch });

    await executeVapiToolCalls(deps, {
      toolCallList: [toolCall('id-a', 'getMenu'), toolCall('id-b', 'getMenu')],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });

    expect(dispatchCount).toBe(2);
  });
});

describe('executeVapiToolCalls — bounded per-call timeout', () => {
  it('a tool dispatch that never resolves still produces a bounded result at TOOL_CALL_TIMEOUT_MS, never hangs the whole delivery', async () => {
    vi.useFakeTimers({ now: NOW });
    const neverResolves: ExecuteVapiToolCallsDeps['dispatch'] = () => new Promise(() => {});
    const deps = buildDeps({ dispatch: neverResolves });

    const resultPromise = executeVapiToolCalls(deps, {
      toolCallList: [toolCall('c1', 'getMenu')],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });

    await vi.advanceTimersByTimeAsync(TOOL_CALL_TIMEOUT_MS);
    const results = await resultPromise;

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.result);
    expect(parsed.error).toBeDefined();
  });

  it('a fast dispatch resolves before the timeout fires — the timeout never wins the race unnecessarily', async () => {
    const fast: ExecuteVapiToolCallsDeps['dispatch'] = async () => ok({ fast: true });
    const results = await executeVapiToolCalls(buildDeps({ dispatch: fast }), {
      toolCallList: [toolCall('c1', 'getMenu')],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });
    expect(JSON.parse(results[0]!.result)).toEqual({ fast: true });
  });
});

describe('executeVapiToolCalls — result serialization matches text chat', () => {
  it('a successful dispatch is JSON.stringify(value), an errored dispatch is JSON.stringify({error: message}) — the exact orchestrator.ts convention', async () => {
    const failing: ExecuteVapiToolCallsDeps['dispatch'] = async (): Promise<
      Result<unknown, AppError>
    > => ({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'That item could not be found.', status: 404 },
    });
    const results = await executeVapiToolCalls(buildDeps({ dispatch: failing }), {
      toolCallList: [toolCall('c1', 'getMenu')],
      sessionId: 'voice:call_1',
      locale: 'en',
      correlationId: 'corr-1',
    });
    expect(results[0]!.result).toBe(JSON.stringify({ error: 'That item could not be found.' }));
  });
});

/**
 * The concierge tool registry — Runbook Step 27, on top of Step 26's
 * schemas/tools. Each entry pairs a hand-written JSON schema (never an
 * auto-derived one that could silently drop `additionalProperties: false`
 * — ADR-0005: "strict, schema-validated tools that reject unknown
 * properties") with the zod schema that actually enforces it server-side,
 * and the pure tool function itself. `dispatchToolCall` is the one place
 * a model-supplied tool name/input ever reaches a real function call:
 * an unknown tool name or a schema-invalid input never executes anything.
 *
 * `ToolExecutionContext` is server-resolved (`sessionId`, `locale`) —
 * never something the model supplies, matching `viewCart`'s "no
 * browser-supplied session ID" contract for every tool, not only that one.
 */

import { err, ok, type Result } from '../../lib/result';
import { notFound, validationFailed, type AppError } from '../../lib/errors';
import type { Locale } from '../../lib/i18n/locale';
import type { ChatToolDefinition } from '../integrations/anthropic-client';
import {
  getMenuInputSchema,
  getRequestStatusInputSchema,
  getVenueInfoInputSchema,
  viewCartInputSchema,
} from './schemas';
import { getMenu } from './tools/get-menu';
import { getVenueInfo } from './tools/get-venue-info';
import { viewCart } from './tools/view-cart';
import { getRequestStatus } from './tools/get-request-status';
import { cartDeps, requestStatusDeps } from './deps';

export interface ToolExecutionContext {
  readonly sessionId: string;
  readonly locale: Locale;
  readonly correlationId: string;
}

interface ToolRegistryEntry {
  readonly definition: ChatToolDefinition;
  readonly execute: (rawInput: unknown, context: ToolExecutionContext) => Promise<unknown>;
}

const GET_MENU_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 100 },
    category: { type: 'string' },
    itemId: { type: 'string' },
  },
};

const GET_VENUE_INFO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['topic'],
  properties: {
    topic: {
      type: 'string',
      enum: [
        'HOURS',
        'DIRECTIONS',
        'CONTACT',
        'SEATING',
        'DELIVERY',
        'BIRTHDAY_DECOR',
        'CAKES',
        'OUTSIDE_FOOD',
      ],
    },
  },
};

const VIEW_CART_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

const GET_REQUEST_STATUS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId'],
  properties: {
    requestId: { type: 'string', format: 'uuid' },
  },
};

const REGISTRY: Readonly<Record<string, ToolRegistryEntry>> = {
  getMenu: {
    definition: {
      name: 'getMenu',
      description:
        'Browse or look up published Cladium Café & Resort menu items, optionally filtered by a search query, category, or a specific item id. Never invents an item — call this instead of stating a menu item, price, or availability from memory.',
      inputSchema: GET_MENU_SCHEMA,
    },
    async execute(rawInput) {
      const parsed = getMenuInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for getMenu.' };
      return getMenu(parsed.data);
    },
  },
  getVenueInfo: {
    definition: {
      name: 'getVenueInfo',
      description:
        'Get approved venue information — hours (with live open/closed status), directions/address, WhatsApp contact, or a specific policy (seating, delivery, birthday décor, cakes, or outside food).',
      inputSchema: GET_VENUE_INFO_SCHEMA,
    },
    async execute(rawInput, context) {
      const parsed = getVenueInfoInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for getVenueInfo.' };
      return getVenueInfo(parsed.data, context.locale);
    },
  },
  viewCart: {
    definition: {
      name: 'viewCart',
      description:
        "View the guest's current takeaway cart and its server-computed totals. Takes no input — the cart belongs to the caller's own session automatically.",
      inputSchema: VIEW_CART_SCHEMA,
    },
    async execute(rawInput, context) {
      const parsed = viewCartInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for viewCart.' };
      const result = await viewCart(cartDeps, context.sessionId);
      return result.ok ? result.value : { error: result.error.message };
    },
  },
  getRequestStatus: {
    definition: {
      name: 'getRequestStatus',
      description:
        "Look up the current status of one of the caller's own takeaway/booking/event requests by its id. Never reveals another guest's request.",
      inputSchema: GET_REQUEST_STATUS_SCHEMA,
    },
    async execute(rawInput, context) {
      const parsed = getRequestStatusInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for getRequestStatus.' };
      return getRequestStatus(requestStatusDeps, context.sessionId, parsed.data.requestId);
    },
  },
};

export const TOOL_DEFINITIONS: readonly ChatToolDefinition[] = Object.values(REGISTRY).map(
  (entry) => entry.definition,
);

/** The one place a model-supplied tool name/input ever reaches a real function call. */
export async function dispatchToolCall(
  name: string,
  rawInput: unknown,
  context: ToolExecutionContext,
): Promise<Result<unknown, AppError>> {
  const entry = REGISTRY[name];
  if (!entry) return err(notFound(context.correlationId));

  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    return err(
      validationFailed([{ path: '(input)', code: 'invalid_type' }], context.correlationId),
    );
  }

  const value = await entry.execute(rawInput, context);
  return ok(value);
}

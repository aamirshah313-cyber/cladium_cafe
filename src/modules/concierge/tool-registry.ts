/**
 * The concierge tool registry — Runbook Steps 27–28, on top of Step 26's
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
 *
 * Step 28's `prepareBookingRequest`/`prepareEventRequest` only ever draft
 * — echo a review, issue a single-use confirmation token — never write a
 * request record. There is deliberately no `submitBookingRequest`/
 * `submitEventRequest`/`submitTakeawayRequest` entry in this registry at
 * all: "the assistant may present a structured review but cannot submit
 * directly." The model is structurally unable to cause a write (an
 * attempt to call an unregistered submit tool name fails `NOT_FOUND`,
 * the same as any other unknown tool) — only a guest tapping the visible
 * confirm control the chat UI renders, which calls the existing
 * `POST /api/{bookings,events}/submit` route directly, ever can.
 */

import { err, ok, type Result } from '../../lib/result';
import { notFound, validationFailed, type AppError } from '../../lib/errors';
import type { Locale } from '../../lib/i18n/locale';
import type { ChatToolDefinition } from '../integrations/anthropic-client';
import {
  getMenuInputSchema,
  getRequestStatusInputSchema,
  getVenueInfoInputSchema,
  prepareBookingInputSchema,
  prepareEventInputSchema,
  viewCartInputSchema,
} from './schemas';
import { getMenu } from './tools/get-menu';
import { getVenueInfo } from './tools/get-venue-info';
import { viewCart } from './tools/view-cart';
import { getRequestStatus } from './tools/get-request-status';
import { prepareBookingDraft } from './tools/prepare-booking';
import { prepareEventDraft } from './tools/prepare-event';
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

const PREPARE_BOOKING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'guestName',
    'guestPhone',
    'requestedDate',
    'requestedTime',
    'partySize',
    'seatingPreference',
  ],
  properties: {
    guestName: { type: 'string', minLength: 2, maxLength: 80 },
    guestPhone: {
      type: 'string',
      description: 'A Pakistani mobile number, e.g. 03001234567 or +923001234567.',
    },
    requestedDate: { type: 'string', description: 'YYYY-MM-DD, today or a future date.' },
    requestedTime: { type: 'string', description: 'HH:MM, 24-hour.' },
    partySize: { type: 'integer', minimum: 1, maximum: 200 },
    seatingPreference: { type: 'string', enum: ['GENERAL', 'TREEHOUSE'] },
    notes: { type: 'string', maxLength: 500 },
  },
};

const PREPARE_EVENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'guestName',
    'guestPhone',
    'occasion',
    'requestedDate',
    'requestedTime',
    'guestCount',
    'decorInterest',
  ],
  properties: {
    guestName: { type: 'string', minLength: 2, maxLength: 80 },
    guestPhone: {
      type: 'string',
      description: 'A Pakistani mobile number, e.g. 03001234567 or +923001234567.',
    },
    occasion: { type: 'string', minLength: 2, maxLength: 100 },
    requestedDate: { type: 'string', description: 'YYYY-MM-DD, today or a future date.' },
    requestedTime: { type: 'string', description: 'HH:MM, 24-hour.' },
    guestCount: { type: 'integer', minimum: 1, maximum: 200 },
    decorInterest: { type: 'boolean' },
    notes: { type: 'string', maxLength: 500 },
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
      return await getMenu(parsed.data);
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
  prepareBookingRequest: {
    definition: {
      name: 'prepareBookingRequest',
      description:
        'Draft a table/treehouse booking request once you have gathered every field from the guest in conversation. Only ever prepares a review and a confirmation code — it never books or confirms anything. Tell the guest their request is not booked until they tap Confirm on the review you show them; treehouse capacity always needs staff confirmation regardless.',
      inputSchema: PREPARE_BOOKING_SCHEMA,
    },
    async execute(rawInput, context) {
      const parsed = prepareBookingInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for prepareBookingRequest.' };
      const result = await prepareBookingDraft(parsed.data, context.sessionId);
      return result.ok ? result.value : { error: result.error.message };
    },
  },
  prepareEventRequest: {
    definition: {
      name: 'prepareEventRequest',
      description:
        'Draft a birthday/event enquiry once you have gathered every field from the guest in conversation. Only ever prepares a review and a confirmation code — it never books, quotes, or confirms anything. Décor starts from PKR 8,000; never state a final price. Tell the guest their enquiry is not confirmed until they tap Confirm and staff follow up with a real quote.',
      inputSchema: PREPARE_EVENT_SCHEMA,
    },
    async execute(rawInput, context) {
      const parsed = prepareEventInputSchema.safeParse(rawInput);
      if (!parsed.success) return { error: 'Invalid input for prepareEventRequest.' };
      const result = await prepareEventDraft(parsed.data, context.sessionId);
      return result.ok ? result.value : { error: result.error.message };
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

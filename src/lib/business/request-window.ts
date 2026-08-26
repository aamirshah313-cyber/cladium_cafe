/**
 * Requested-date sanity check — Runbook Step 22, promoted to `lib/business/`
 * in Step 23 so both `modules/bookings/` and `modules/events/` can share it
 * without one importing the other's module (production-architecture-v2.md
 * §4: `modules/business/` is "hours, location, contact and policy",
 * `lib/` is "shared primitives only").
 *
 * "A requested time is not availability" (data-model-v2.md §5) — this is
 * deliberately *not* an availability/capacity check. It only rejects a date
 * that has already passed in Abbottabad local time, the same basic sanity a
 * guest would expect ("you can't request today for yesterday"). Timezone-
 * aware like `hours.ts`, for the same reason: the server may run in any
 * timezone, but "today" means Abbottabad's today.
 */

import { CAFE_TIMEZONE } from './hours';

function localDateString(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone }); // en-CA formats as YYYY-MM-DD
  return formatter.format(instant);
}

/** `requestedDate` must be a valid `YYYY-MM-DD` string (schema-validated before this runs). */
export function isTodayOrFutureDate(
  requestedDate: string,
  instant: Date,
  timeZone: string = CAFE_TIMEZONE,
): boolean {
  return requestedDate >= localDateString(instant, timeZone);
}

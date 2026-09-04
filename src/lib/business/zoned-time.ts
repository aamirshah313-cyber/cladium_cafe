/**
 * Conversion between Abbottabad wall-clock time and absolute instants.
 *
 * The domain stores a requested date and time as two separate local strings
 * (`requestedDate` `YYYY-MM-DD`, `requestedTime` `HH:MM`), while
 * `booking_requests.requested_at` and `event_requests.requested_at` are
 * single `timestamptz` columns. Something has to decide which wall clock
 * those strings refer to, and the answer is the café's, not the server's:
 * `hours.ts` and `request-window.ts` already establish that "the server may
 * run in any timezone, but 'today' means Abbottabad's today."
 *
 * This matters for correctness, not tidiness. Building the instant with
 * `new Date(\`${date}T${time}\`)` uses whatever zone the process happens to
 * run in — UTC on Vercel — so a 19:00 booking would silently persist as
 * 19:00Z, which is midnight in Abbottabad: the wrong day, five hours off,
 * with nothing to signal it went wrong.
 *
 * Uses `Intl` with an explicit IANA zone and no new dependency, matching
 * `hours.ts`'s approach.
 */

import { CAFE_TIMEZONE } from './hours';

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // `hour12: false` renders midnight as "24" in some ICU versions — a
    // long-standing Intl quirk that would otherwise shift a midnight
    // booking by a whole day.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * Interprets a local `YYYY-MM-DD` + `HH:MM` in `timeZone` and returns the
 * absolute instant.
 *
 * Solves for the offset rather than assuming one: the wall clock is first
 * read as if it were UTC, the zone's offset at that approximate instant is
 * measured, and the guess is corrected. The correction is applied twice
 * because the offset is itself a function of the instant — near a DST
 * boundary the first correction can land on the other side of the
 * transition. Pakistan observes no DST today, so the second pass is
 * currently a no-op, but relying on that would make this quietly wrong if
 * it were ever reused for another zone.
 */
export function zonedDateTimeToInstant(
  date: string,
  time: string,
  timeZone: string = CAFE_TIMEZONE,
): Date {
  const wallClockAsUtc = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(wallClockAsUtc)) {
    throw new Error(`invalid date/time: ${date} ${time}`);
  }
  let instant = wallClockAsUtc - offsetMsAt(new Date(wallClockAsUtc), timeZone);
  instant = wallClockAsUtc - offsetMsAt(new Date(instant), timeZone);
  return new Date(instant);
}

/** The inverse: the local date and time this instant shows in `timeZone`. */
export function instantToZonedDateTime(
  instant: Date,
  timeZone: string = CAFE_TIMEZONE,
): { readonly date: string; readonly time: string } {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

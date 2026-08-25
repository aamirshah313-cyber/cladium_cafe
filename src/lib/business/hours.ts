/**
 * Open/closed status for the confirmed "12 pm–12 am" hours — Runbook Step 15.
 *
 * `cladium-research/data/business-profile.json`: hours are confirmed by a
 * Cladium representative as "12 pm–12 am", i.e. open from local noon through
 * local midnight. This computes only whether *now* falls in that window; it
 * never invents exceptions, holiday closures, or early-closing days — none
 * are confirmed, and `business-profile.json`'s `unverified_or_missing` list
 * does not include an hours-exceptions source.
 *
 * Deliberately timezone-aware (`Intl.DateTimeFormat` with an explicit IANA
 * zone, no new dependency): the server may run in any timezone (typically
 * UTC in production), but "12 pm" means Abbottabad local noon, not the
 * server's local noon.
 */

export const CAFE_TIMEZONE = 'Asia/Karachi';
const OPEN_LOCAL_HOUR = 12; // 12 pm
const CLOSE_LOCAL_HOUR = 24; // 12 am (midnight) — exclusive upper bound

function localHour(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  return Number(formatter.format(instant));
}

/** True from local noon up to (not including) local midnight. */
export function isOpenAt(instant: Date, timeZone: string = CAFE_TIMEZONE): boolean {
  const hour = localHour(instant, timeZone);
  return hour >= OPEN_LOCAL_HOUR && hour < CLOSE_LOCAL_HOUR;
}

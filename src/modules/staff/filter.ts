/**
 * Shared, safe queue filter — Runbook Step 24.
 *
 * "Safe search/filtering": a plain in-memory case-insensitive substring
 * match against name/phone, never a raw query string passed to a database
 * or regex — there is no injection surface here, and a real adapter would
 * translate this same `{state, search}` shape into a parameterized `WHERE`
 * clause. Shared by all three entities because `TakeawayRequestRecord`,
 * `BookingRequestRecord`, and `EventRequestRecord` all carry `state`,
 * `guestName`, and `guestPhone`.
 */

export interface RequestFilter<S extends string> {
  readonly state?: S;
  readonly search?: string;
}

export function matchesRequestFilter<S extends string>(
  record: { readonly state: S; readonly guestName: string; readonly guestPhone: string },
  filter: RequestFilter<S>,
): boolean {
  if (filter.state && record.state !== filter.state) return false;

  const needle = filter.search?.trim().toLowerCase();
  if (needle && needle.length > 0) {
    const haystack = `${record.guestName} ${record.guestPhone}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

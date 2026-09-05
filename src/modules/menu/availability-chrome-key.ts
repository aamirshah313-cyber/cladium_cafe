/**
 * Maps an item's tri-state `AvailabilityStatus` to its chrome text key.
 * Extracted from `menu/page.tsx` (Step 17) so the menu feature carousel
 * (Step 18) can share the exact same mapping instead of duplicating it.
 */

import type { ChromeKey } from '../../lib/i18n/chrome';
import type { AvailabilityStatus } from '../../lib/schemas/common';

export function availabilityChromeKey(status: AvailabilityStatus): ChromeKey {
  switch (status) {
    case 'AVAILABLE':
      return 'availabilityAvailable';
    case 'UNAVAILABLE':
      return 'availabilityUnavailable';
    case 'UNKNOWN':
      return 'availabilityUnknown';
  }
}

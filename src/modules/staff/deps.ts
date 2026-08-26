/**
 * Process-lifetime staff singletons — Runbook Steps 24–25.
 *
 * `staffDirectory`/`devAccounts` are Step 24 (see `dev-credentials.ts`'s doc
 * comment for why a dev-only fixture backs them). `staffNotifications` is
 * Step 25: the durable store the `staff_notification` outbox handler
 * (`notification-handlers.ts`) writes into and `app/api/staff/notifications`
 * reads from — in-memory, not durable, same caveat as every other Step
 * 19–24 singleton (D-023).
 */

import { parseStaffDevAccounts, type StaffDevAccount } from '../../lib/env.server';
import { createDevStaffDirectory, type StaffDirectory } from './directory';
import {
  createInMemoryStaffNotificationStore,
  type StaffNotificationStore,
} from './notification-store';

export const devAccounts: readonly StaffDevAccount[] = parseStaffDevAccounts();
export const staffDirectory: StaffDirectory = createDevStaffDirectory(devAccounts);
export const staffNotifications: StaffNotificationStore = createInMemoryStaffNotificationStore();

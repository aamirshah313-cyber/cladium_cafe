/**
 * Process-lifetime deps for the consent module — Runbook Step 36. Same
 * in-memory-now, real-Postgres-adapter-later shape as every other
 * `modules/<name>/deps.ts` here (D-023) — `createInMemoryConsentEventStore()`
 * is the one store a real adapter eventually replaces, without any route
 * or service call site changing.
 */

import { createInMemoryConsentEventStore } from './consent-store';
import type { ConsentServiceDeps } from './consent-service';

export const consentStore = createInMemoryConsentEventStore();

export const consentDeps: ConsentServiceDeps = {
  store: consentStore,
};

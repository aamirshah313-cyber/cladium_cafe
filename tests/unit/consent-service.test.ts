import { describe, expect, it } from 'vitest';
import {
  getConsentSnapshot,
  hasConsent,
  recordConsent,
  type ConsentServiceDeps,
} from '../../src/modules/consent/consent-service';
import { createInMemoryConsentEventStore } from '../../src/modules/consent/consent-store';
import { CONSENT_DEFAULT_GRANTED, CONSENT_POLICY_VERSION } from '../../src/modules/consent/policy';
import type { ConsentCategory } from '../../src/lib/schemas/common';

const NOW = new Date('2026-08-29T12:00:00Z');

function buildDeps(): ConsentServiceDeps {
  return { store: createInMemoryConsentEventStore(), now: () => NOW };
}

const ALL_CATEGORIES: readonly ConsentCategory[] = [
  'ESSENTIAL_PREFERENCES',
  'META_MARKETING',
  'MICROPHONE',
  'RECORDING',
];

describe('getConsentSnapshot — defaults ("locale/theme" essential-preferences evidence)', () => {
  it('a brand-new session with zero recorded events gets every category default-populated', async () => {
    const deps = buildDeps();
    const snapshot = await getConsentSnapshot(deps, 'new-session');
    for (const category of ALL_CATEGORIES) {
      expect(snapshot[category].granted).toBe(CONSENT_DEFAULT_GRANTED[category]);
      expect(snapshot[category].recordedAt).toBeNull();
      expect(snapshot[category].stale).toBe(false);
    }
  });

  it('ESSENTIAL_PREFERENCES defaults to granted — locale/theme keep working with zero consent action', async () => {
    const deps = buildDeps();
    const snapshot = await getConsentSnapshot(deps, 'brand-new-session');
    expect(snapshot.ESSENTIAL_PREFERENCES.granted).toBe(true);
  });

  it('META_MARKETING, MICROPHONE, and RECORDING all default to NOT granted — fail closed', async () => {
    const deps = buildDeps();
    const snapshot = await getConsentSnapshot(deps, 'brand-new-session');
    expect(snapshot.META_MARKETING.granted).toBe(false);
    expect(snapshot.MICROPHONE.granted).toBe(false);
    expect(snapshot.RECORDING.granted).toBe(false);
  });
});

describe('recordConsent / getConsentSnapshot — grant/revoke', () => {
  it('an explicit grant is reflected in the next snapshot', async () => {
    const deps = buildDeps();
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      source: 'voice_panel',
      correlationId: 'corr-1',
    });
    const snapshot = await getConsentSnapshot(deps, 'session-1');
    expect(snapshot.MICROPHONE.granted).toBe(true);
    expect(snapshot.MICROPHONE.recordedAt).toBe(NOW.toISOString());
  });

  it('a later revoke overrides an earlier grant — the ledger keeps both, the snapshot reflects the latest', async () => {
    const deps = buildDeps();
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'META_MARKETING',
      granted: true,
      source: 'privacy_page',
      correlationId: 'corr-1',
    });
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'META_MARKETING',
      granted: false,
      source: 'privacy_page',
      correlationId: 'corr-2',
    });
    const snapshot = await getConsentSnapshot(deps, 'session-1');
    expect(snapshot.META_MARKETING.granted).toBe(false);

    const events = await deps.store.list();
    expect(events).toHaveLength(2);
  });

  it('categories are distinct — granting one never affects another', async () => {
    const deps = buildDeps();
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      source: 'voice_panel',
      correlationId: 'corr-1',
    });
    const snapshot = await getConsentSnapshot(deps, 'session-1');
    expect(snapshot.MICROPHONE.granted).toBe(true);
    expect(snapshot.META_MARKETING.granted).toBe(false);
    expect(snapshot.RECORDING.granted).toBe(false);
  });

  it('consent is session-scoped — one session granting never affects another session', async () => {
    const deps = buildDeps();
    await recordConsent(deps, {
      sessionId: 'session-a',
      category: 'MICROPHONE',
      granted: true,
      source: 'voice_panel',
      correlationId: 'corr-1',
    });
    const other = await getConsentSnapshot(deps, 'session-b');
    expect(other.MICROPHONE.granted).toBe(false);
  });
});

describe('getConsentSnapshot — versioned policy', () => {
  it('an event recorded under the current policy version is not stale', async () => {
    const deps = buildDeps();
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      source: 'voice_panel',
      correlationId: 'corr-1',
    });
    const snapshot = await getConsentSnapshot(deps, 'session-1');
    expect(snapshot.MICROPHONE.policyVersion).toBe(CONSENT_POLICY_VERSION);
    expect(snapshot.MICROPHONE.stale).toBe(false);
  });

  it('an event recorded under an earlier policy version is marked stale', async () => {
    const deps = buildDeps();
    // Simulate an old consent by appending directly with a stale version.
    await deps.store.append({
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      policyVersion: 'an-old-version',
      source: 'voice_panel',
      proof: {},
      correlationId: 'corr-1',
      occurredAt: NOW.toISOString(),
    });
    const snapshot = await getConsentSnapshot(deps, 'session-1');
    expect(snapshot.MICROPHONE.granted).toBe(true); // still the last recorded grant/revoke state
    expect(snapshot.MICROPHONE.stale).toBe(true);
  });
});

describe('hasConsent', () => {
  it('reads through to the current snapshot for the given category', async () => {
    const deps = buildDeps();
    expect(await hasConsent(deps, 'session-1', 'MICROPHONE')).toBe(false);
    await recordConsent(deps, {
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      source: 'voice_panel',
      correlationId: 'corr-1',
    });
    expect(await hasConsent(deps, 'session-1', 'MICROPHONE')).toBe(true);
  });

  it('"analytics blocking" — META_MARKETING has no consent by default, the primitive Step 37 will gate on', async () => {
    const deps = buildDeps();
    expect(await hasConsent(deps, 'any-session-never-asked', 'META_MARKETING')).toBe(false);
  });
});

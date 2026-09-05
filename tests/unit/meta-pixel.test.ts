import { describe, expect, it, vi } from 'vitest';
import { resolveMetaPixelId } from '../../src/modules/integrations/meta-pixel';

function deps(overrides: {
  isFeatureEnabled?: boolean;
  pixelId?: string | undefined;
  consented?: boolean;
}) {
  const pixelIdValue = 'pixelId' in overrides ? overrides.pixelId : 'pixel-123';
  return {
    isFeatureEnabled: vi.fn(() => overrides.isFeatureEnabled ?? true),
    pixelId: vi.fn(() => pixelIdValue),
    hasConsent: vi.fn(async () => overrides.consented ?? true),
  };
}

describe('resolveMetaPixelId — Step 37 follow-up (browser Pixel bootstrap eligibility)', () => {
  it('returns null when the feature flag is off, without ever checking pixel id or consent', async () => {
    const d = deps({ isFeatureEnabled: false });
    expect(await resolveMetaPixelId(d, 'session-1')).toBeNull();
    expect(d.pixelId).not.toHaveBeenCalled();
    expect(d.hasConsent).not.toHaveBeenCalled();
  });

  it('returns null when no pixel id is configured, without checking consent', async () => {
    const d = deps({ pixelId: undefined });
    expect(await resolveMetaPixelId(d, 'session-1')).toBeNull();
    expect(d.hasConsent).not.toHaveBeenCalled();
  });

  it('returns null when there is no verified session yet, without checking consent', async () => {
    const d = deps({});
    expect(await resolveMetaPixelId(d, null)).toBeNull();
    expect(d.hasConsent).not.toHaveBeenCalled();
  });

  it('returns null when META_MARKETING consent is not granted for this session', async () => {
    const d = deps({ consented: false });
    expect(await resolveMetaPixelId(d, 'session-1')).toBeNull();
    expect(d.hasConsent).toHaveBeenCalledWith('session-1');
  });

  it('returns the pixel id once flag, pixel id, session, and consent all line up', async () => {
    const d = deps({ pixelId: 'pixel-abc', consented: true });
    expect(await resolveMetaPixelId(d, 'session-1')).toBe('pixel-abc');
  });
});

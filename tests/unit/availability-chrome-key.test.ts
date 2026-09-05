import { describe, expect, it } from 'vitest';
import { availabilityChromeKey } from '../../src/modules/menu/availability-chrome-key';

describe('availabilityChromeKey', () => {
  it('maps AVAILABLE', () => {
    expect(availabilityChromeKey('AVAILABLE')).toBe('availabilityAvailable');
  });

  it('maps UNAVAILABLE', () => {
    expect(availabilityChromeKey('UNAVAILABLE')).toBe('availabilityUnavailable');
  });

  it('maps UNKNOWN', () => {
    expect(availabilityChromeKey('UNKNOWN')).toBe('availabilityUnknown');
  });
});

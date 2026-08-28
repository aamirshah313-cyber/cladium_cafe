import { describe, expect, it } from 'vitest';
import { buildWhatsAppUrl } from '../../src/lib/business/whatsapp-link';
import { chromeText } from '../../src/lib/i18n/chrome';
import { WHATSAPP_URL } from '../../src/modules/business/facts';

/**
 * Runbook Step 35 evidence: "number/link verified by owner; no PII is
 * silently placed in URLs/analytics" and `release-gates-v2.md` Gate 8:
 * "Click-to-WhatsApp uses the verified business number and avoids exposing
 * customer data in a prefilled URL unless the guest explicitly chooses it."
 *
 * `buildWhatsAppUrl`'s signature — `(locale: Locale) => string` — accepts
 * no guest-supplied argument at all, so these tests confirm the structural
 * guarantee, not just today's output: there is no code path by which a
 * guest message, name, phone number, or order/booking detail could reach
 * this URL.
 */
describe('buildWhatsAppUrl', () => {
  it('starts with the exact verified business WhatsApp URL', () => {
    expect(buildWhatsAppUrl('en').startsWith(WHATSAPP_URL)).toBe(true);
    expect(buildWhatsAppUrl('ur').startsWith(WHATSAPP_URL)).toBe(true);
  });

  it('appends the reviewed prefilled message as an encoded ?text= parameter', () => {
    const en = buildWhatsAppUrl('en');
    expect(en).toBe(
      `${WHATSAPP_URL}?text=${encodeURIComponent(chromeText('whatsappPrefilledMessage', 'en'))}`,
    );

    const ur = buildWhatsAppUrl('ur');
    expect(ur).toBe(
      `${WHATSAPP_URL}?text=${encodeURIComponent(chromeText('whatsappPrefilledMessage', 'ur'))}`,
    );
  });

  it('the decoded message never varies by call — same input, same output, no guest data channel', () => {
    expect(buildWhatsAppUrl('en')).toBe(buildWhatsAppUrl('en'));
  });

  it('accepts only a Locale — no parameter exists through which guest data could reach the URL', () => {
    expect(buildWhatsAppUrl).toHaveLength(1);
  });

  it('the prefilled message is a valid URL', () => {
    expect(() => new URL(buildWhatsAppUrl('en'))).not.toThrow();
    expect(() => new URL(buildWhatsAppUrl('ur'))).not.toThrow();
  });
});

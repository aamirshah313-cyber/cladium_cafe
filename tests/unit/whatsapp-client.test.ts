import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhatsAppCloudClient } from '../../src/modules/integrations/whatsapp-client';

const CONFIGURED_ENV = {
  WHATSAPP_PHONE_NUMBER_ID: 'phone-123',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-456',
  WHATSAPP_ACCESS_TOKEN: 'token-secret-abc',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createWhatsAppCloudClient — no configured credentials', () => {
  it('sendTemplateMessage throws (fail closed) without ever calling fetch, when credentials are unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWhatsAppCloudClient({});

    await expect(
      client.sendTemplateMessage({
        toPhoneNumber: '923123978889',
        templateName: 'booking_ack',
        languageCode: 'en',
      }),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendTemplateMessage throws when only some of the three required vars are set', async () => {
    const client = createWhatsAppCloudClient({ WHATSAPP_PHONE_NUMBER_ID: 'phone-123' });
    await expect(
      client.sendTemplateMessage({
        toPhoneNumber: '923123978889',
        templateName: 'booking_ack',
        languageCode: 'en',
      }),
    ).rejects.toThrow();
  });
});

describe('createWhatsAppCloudClient — configured credentials', () => {
  it('posts to the phone-number messages endpoint with the documented Cloud API request shape', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWhatsAppCloudClient(CONFIGURED_ENV);

    await client.sendTemplateMessage({
      toPhoneNumber: '923123978889',
      templateName: 'booking_ack',
      languageCode: 'en',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Friday 7pm' }] }],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('phone-123');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-secret-abc');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '923123978889',
      type: 'template',
      template: {
        name: 'booking_ack',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Friday 7pm' }] }],
      },
    });
  });

  it('omits components entirely when none are given', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWhatsAppCloudClient(CONFIGURED_ENV);

    await client.sendTemplateMessage({
      toPhoneNumber: '923123978889',
      templateName: 'booking_ack',
      languageCode: 'en',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.template).not.toHaveProperty('components');
  });

  it('never sends a field beyond the documented Cloud API shape (no notes/free text leaks in)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWhatsAppCloudClient(CONFIGURED_ENV);

    await client.sendTemplateMessage({
      toPhoneNumber: '923123978889',
      templateName: 'booking_ack',
      languageCode: 'en',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(
      ['messaging_product', 'to', 'type', 'template'].sort(),
    );
  });

  it('throws when the Meta API responds with a non-OK status', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWhatsAppCloudClient(CONFIGURED_ENV);

    await expect(
      client.sendTemplateMessage({
        toPhoneNumber: '923123978889',
        templateName: 'booking_ack',
        languageCode: 'en',
      }),
    ).rejects.toThrow(/401/);
  });
});

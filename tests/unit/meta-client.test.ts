import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMetaEventClient } from '../../src/modules/integrations/meta-client';

const NOW = new Date('2026-08-29T12:00:00Z');

const CONFIGURED_ENV = {
  META_PIXEL_ID: 'pixel-123',
  META_DATASET_ID: 'dataset-456',
  META_CONVERSIONS_API_TOKEN: 'token-secret-abc',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createMetaEventClient — no configured credentials', () => {
  it('sendEvent throws (fail closed) without ever calling fetch, when credentials are unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = createMetaEventClient({});

    await expect(
      client.sendEvent({ eventName: 'view_menu', eventId: 'evt-1', occurredAt: NOW }),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendEvent throws when only some of the three required vars are set', async () => {
    const client = createMetaEventClient({ META_PIXEL_ID: 'pixel-123' });
    await expect(
      client.sendEvent({ eventName: 'view_menu', eventId: 'evt-1', occurredAt: NOW }),
    ).rejects.toThrow();
  });
});

describe('createMetaEventClient — configured credentials', () => {
  it('posts to the dataset events endpoint with the documented CAPI request shape', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createMetaEventClient(CONFIGURED_ENV);

    await client.sendEvent({
      eventName: 'submit_booking_request',
      eventId: 'evt-shared-id',
      occurredAt: NOW,
      eventSourceUrl: '/en/book',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('dataset-456');
    expect(url).toContain('access_token=token-secret-abc');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      data: [
        {
          event_name: 'submit_booking_request',
          event_id: 'evt-shared-id',
          event_time: Math.floor(NOW.getTime() / 1000),
          action_source: 'website',
          event_source_url: '/en/book',
        },
      ],
    });
  });

  it('omits event_source_url entirely when none is given', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createMetaEventClient(CONFIGURED_ENV);

    await client.sendEvent({ eventName: 'lead', eventId: 'evt-2', occurredAt: NOW });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data[0]).not.toHaveProperty('event_source_url');
  });

  it('never sends a name, phone, note, or any field beyond the documented CAPI shape', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createMetaEventClient(CONFIGURED_ENV);

    await client.sendEvent({
      eventName: 'submit_event_request',
      eventId: 'evt-3',
      occurredAt: NOW,
      eventSourceUrl: '/ur/event',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body.data[0]).sort()).toEqual(
      ['action_source', 'event_id', 'event_name', 'event_source_url', 'event_time'].sort(),
    );
  });

  it('throws when the Meta API responds with a non-OK status', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createMetaEventClient(CONFIGURED_ENV);

    await expect(
      client.sendEvent({ eventName: 'view_menu', eventId: 'evt-4', occurredAt: NOW }),
    ).rejects.toThrow(/401/);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createWebhookHandler, parseNangoWebhook } from './webhooks';

describe('parseNangoWebhook', () => {
  it('normalizes an auth webhook to connection.created', () => {
    const event = parseNangoWebhook({
      type: 'auth',
      connectionId: 'conn-1',
      providerConfigKey: 'gmail',
      provider: 'google',
    });

    expect(event.kind).toBe('connection.created');
    expect(event.connectionId).toBe('conn-1');
    expect(event.provider).toBe('google');
  });

  it('normalizes a sync webhook to sync.completed', () => {
    const event = parseNangoWebhook({
      type: 'sync',
      connectionId: 'conn-1',
      providerConfigKey: 'gmail',
    });

    expect(event.kind).toBe('sync.completed');
    expect(event.provider).toBeNull();
  });

  it('maps an unrecognized type to unknown', () => {
    const event = parseNangoWebhook({
      type: 'forward',
      connectionId: 'conn-1',
      providerConfigKey: 'gmail',
    });

    expect(event.kind).toBe('unknown');
  });
});

describe('createWebhookHandler', () => {
  it('passes the normalized event to the handler', async () => {
    const onEvent = vi.fn(() => Promise.resolve());

    await createWebhookHandler(onEvent)({
      type: 'auth',
      connectionId: 'conn-1',
      providerConfigKey: 'gmail',
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'connection.created' }),
    );
  });
});

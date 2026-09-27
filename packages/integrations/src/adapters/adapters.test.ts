import type { Nango } from '@nangohq/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGmailAdapter } from './gmail';
import { createGoogleCalendarAdapter } from './google-calendar';
import { createSendgridAdapter } from './sendgrid';
import type { AdapterConfig } from './types';

const proxy = vi.fn(() => Promise.resolve({ data: {} }));

function config(): AdapterConfig {
  return {
    nango: { proxy } as unknown as Nango,
    connectionId: 'conn-1',
    providerConfigKey: 'provider-key',
  };
}

describe('adapters', () => {
  beforeEach(() => {
    proxy.mockClear();
  });

  it('gmail sendMessage posts through the Nango proxy with the connection', async () => {
    await createGmailAdapter(config()).sendMessage({
      to: 'a@example.com',
      subject: 'Hi',
      body: 'Body',
    });

    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        endpoint: '/gmail/v1/users/me/messages/send',
        connectionId: 'conn-1',
        providerConfigKey: 'provider-key',
      }),
    );
  });

  it('google-calendar createEvent posts the event through the proxy', async () => {
    await createGoogleCalendarAdapter(config()).createEvent({
      title: 'Sync',
      start: '2026-01-01T10:00:00Z',
      end: '2026-01-01T11:00:00Z',
    });

    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        endpoint: '/calendar/v3/calendars/primary/events',
      }),
    );
  });

  it('sendgrid sendEmail builds the mail-send body', async () => {
    await createSendgridAdapter(config()).sendEmail({
      to: 'a@example.com',
      from: 'b@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        endpoint: '/v3/mail/send',
        data: expect.objectContaining({
          from: { email: 'b@example.com' },
          subject: 'Hi',
        }),
      }),
    );
  });
});

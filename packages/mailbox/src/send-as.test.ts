import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveAccessToken } = vi.hoisted(() => ({
  resolveAccessToken: vi.fn(),
}));
vi.mock('./nango', () => ({ resolveAccessToken }));

import { sendAs } from './index';
import type { MailboxConnection } from './types';

const gmailConnection: MailboxConnection = {
  provider: 'gmail',
  nangoConnectionId: 'conn-g',
  providerConfigKey: 'google-mail',
  emailAddress: 'operator@firm.com',
};

const microsoftConnection: MailboxConnection = {
  provider: 'microsoft',
  nangoConnectionId: 'conn-m',
  providerConfigKey: 'microsoft-mail',
  emailAddress: 'operator@firm.com',
};

const fetchMock = vi.fn();

beforeEach(() => {
  resolveAccessToken.mockResolvedValue('access-token');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendAs gmail', () => {
  it('posts a base64url raw message to the Gmail send endpoint and returns its id', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ id: 'gmail-123' }) });

    const result = await sendAs(gmailConnection, {
      to: 'lead@target.com',
      subject: 'Hello',
      text: 'body',
    });

    expect(result).toEqual({ providerMessageId: 'gmail-123' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer access-token');

    const body = JSON.parse(init.body);
    expect(body.raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(body.raw, 'base64url').toString('utf-8')).toContain(
      'From: operator@firm.com',
    );
  });
});

describe('sendAs microsoft', () => {
  it('posts a Graph message to sendMail and synthesizes a message id', async () => {
    fetchMock.mockResolvedValue({ status: 202 });

    const result = await sendAs(microsoftConnection, {
      to: 'lead@target.com',
      subject: 'Hello',
      html: '<p>body</p>',
      replyTo: 'inbox@firm.com',
    });

    expect(result.providerMessageId).toMatch(/.+/);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer access-token');

    const { message } = JSON.parse(init.body);
    expect(message.subject).toBe('Hello');
    expect(message.body).toEqual({ contentType: 'HTML', content: '<p>body</p>' });
    expect(message.toRecipients).toEqual([
      { emailAddress: { address: 'lead@target.com' } },
    ]);
    expect(message.replyTo).toEqual([
      { emailAddress: { address: 'inbox@firm.com' } },
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveAccessToken } = vi.hoisted(() => ({
  resolveAccessToken: vi.fn(),
}));
vi.mock('./nango', () => ({ resolveAccessToken }));

import { MailboxAccessDenied, listThreadMessages } from './index';
import type { MailboxConnection } from './types';

const gmailConnection: MailboxConnection = {
  provider: 'gmail',
  nangoConnectionId: 'conn-g',
  providerConfigKey: 'google-mail',
  emailAddress: 'operator@firm.com',
};

const microsoftConnection: MailboxConnection = {
  ...gmailConnection,
  provider: 'microsoft',
  providerConfigKey: 'microsoft-mail',
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

describe('listThreadMessages gmail', () => {
  it('reads the thread metadata and returns id, time and bare sender address', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          {
            id: 'm1',
            internalDate: '1767225600000',
            payload: {
              headers: [{ name: 'From', value: 'Lender Lee <lee@bank.com>' }],
            },
          },
        ],
      }),
    });

    const messages = await listThreadMessages(gmailConnection, 'thread-9');

    expect(messages).toEqual([
      {
        providerMessageId: 'm1',
        receivedAt: '2026-01-01T00:00:00.000Z',
        fromAddress: 'lee@bank.com',
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/gmail/v1/users/me/threads/thread-9');
    expect(parsed.searchParams.get('format')).toBe('metadata');
    expect(parsed.searchParams.get('metadataHeaders')).toBe('From');
    expect(init.headers.Authorization).toBe('Bearer access-token');
  });

  it.each([401, 403])('throws MailboxAccessDenied on %i', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });

    await expect(
      listThreadMessages(gmailConnection, 'thread-9'),
    ).rejects.toBeInstanceOf(MailboxAccessDenied);
  });
});

describe('listThreadMessages microsoft', () => {
  it('filters messages by conversation and returns id, time and sender address', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        value: [
          {
            id: 'm2',
            receivedDateTime: '2026-01-01T00:00:00Z',
            from: { emailAddress: { address: 'lee@bank.com' } },
          },
        ],
      }),
    });

    const messages = await listThreadMessages(microsoftConnection, 'conv-1');

    expect(messages).toEqual([
      {
        providerMessageId: 'm2',
        receivedAt: '2026-01-01T00:00:00.000Z',
        fromAddress: 'lee@bank.com',
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v1.0/me/messages');
    expect(parsed.searchParams.get('$filter')).toBe("conversationId eq 'conv-1'");
    expect(init.headers.Authorization).toBe('Bearer access-token');
  });

  it.each([401, 403])('throws MailboxAccessDenied on %i', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });

    await expect(
      listThreadMessages(microsoftConnection, 'conv-1'),
    ).rejects.toBeInstanceOf(MailboxAccessDenied);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveAccessToken } = vi.hoisted(() => ({
  resolveAccessToken: vi.fn(),
}));
vi.mock('./nango', () => ({ resolveAccessToken }));

import { MailboxNoResponse, MailboxRequestFailed, sendAs } from './index';
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
  vi.unstubAllEnvs();
});

describe('sendAs gmail against GMAIL_API_BASE', () => {
  it('reads the thread and sends the reply through the configured base URL', async () => {
    vi.stubEnv('GMAIL_API_BASE', 'http://localhost:4513');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            { payload: { headers: [{ name: 'Message-ID', value: '<first@mail.gmail.com>' }] } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'gmail-reply', threadId: 'thread-9' }),
      });

    await sendAs(gmailConnection, {
      to: 'lead@target.com',
      subject: 'Re: Hello',
      text: 'body',
      inThread: 'thread-9',
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://localhost:4513/gmail/v1/users/me/threads/thread-9?format=metadata&metadataHeaders=Message-ID',
    );
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      'http://localhost:4513/gmail/v1/users/me/messages/send',
    );
  });
});

describe('sendAs gmail', () => {
  it('posts a base64url raw message to the Gmail send endpoint and returns its id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gmail-123', threadId: 'thread-9' }),
    });

    const result = await sendAs(gmailConnection, {
      to: 'lead@target.com',
      subject: 'Hello',
      text: 'body',
    });

    expect(result).toEqual({
      providerMessageId: 'gmail-123',
      threadId: 'thread-9',
    });

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
  it('creates a draft, sends it, and returns the draft id and conversation id', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1', conversationId: 'conv-1' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 202 });

    const result = await sendAs(microsoftConnection, {
      to: 'lead@target.com',
      subject: 'Hello',
      html: '<p>body</p>',
      replyTo: 'inbox@firm.com',
    });

    expect(result).toEqual({ providerMessageId: 'msg-1', threadId: 'conv-1' });

    const [draftUrl, draftInit] = fetchMock.mock.calls[0]!;
    expect(draftUrl).toBe('https://graph.microsoft.com/v1.0/me/messages');
    expect(draftInit.method).toBe('POST');
    expect(draftInit.headers.Authorization).toBe('Bearer access-token');

    const message = JSON.parse(draftInit.body);
    expect(message.subject).toBe('Hello');
    expect(message.body).toEqual({ contentType: 'HTML', content: '<p>body</p>' });
    expect(message.toRecipients).toEqual([
      { emailAddress: { address: 'lead@target.com' } },
    ]);
    expect(message.replyTo).toEqual([
      { emailAddress: { address: 'inbox@firm.com' } },
    ]);

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://graph.microsoft.com/v1.0/me/messages/msg-1/send');
    expect(sendInit.method).toBe('POST');
    expect(sendInit.headers.Authorization).toBe('Bearer access-token');
  });
});

describe('sendAs replying in a thread', () => {
  it('gmail: sends into the thread with In-Reply-To set to the last message and References to the whole chain', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            { payload: { headers: [{ name: 'Message-Id', value: '<first@mail.gmail.com>' }] } },
            { payload: { headers: [{ name: 'Message-ID', value: '<second@lender.com>' }] } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'gmail-reply', threadId: 'thread-9' }),
      });

    const result = await sendAs(gmailConnection, {
      to: 'lead@target.com',
      subject: 'Re: Hello',
      text: 'body',
      inThread: 'thread-9',
    });

    expect(result).toEqual({ providerMessageId: 'gmail-reply', threadId: 'thread-9' });

    const [threadUrl] = fetchMock.mock.calls[0]!;
    expect(String(threadUrl)).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-9?format=metadata&metadataHeaders=Message-ID',
    );

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const body = JSON.parse(sendInit.body);
    expect(body.threadId).toBe('thread-9');
    const raw = Buffer.from(body.raw, 'base64url').toString('utf-8');
    expect(raw).toContain('In-Reply-To: <second@lender.com>\r\n');
    expect(raw).toContain('References: <first@mail.gmail.com> <second@lender.com>\r\n');
    expect(raw).toContain('Subject: Re: Hello\r\n');
  });

  it('microsoft: creates a reply to the latest message in the conversation, addressed to the recipient, then sends it', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            { id: 'later', receivedDateTime: '2026-10-10T10:00:00Z', from: { emailAddress: { address: 'dana@lender.com' } } },
            { id: 'earlier', receivedDateTime: '2026-10-01T10:00:00Z', from: { emailAddress: { address: 'operator@firm.com' } } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'reply-1', conversationId: 'conv-1' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 202 });

    const result = await sendAs(microsoftConnection, {
      to: 'lead@target.com',
      subject: 'Re: Hello',
      text: 'body',
      replyTo: 'inbox@firm.com',
      inThread: 'conv-1',
    });

    expect(result).toEqual({ providerMessageId: 'reply-1', threadId: 'conv-1' });

    const [replyUrl, replyInit] = fetchMock.mock.calls[1]!;
    expect(replyUrl).toBe('https://graph.microsoft.com/v1.0/me/messages/later/createReply');
    expect(replyInit.method).toBe('POST');
    const { message } = JSON.parse(replyInit.body);
    expect(message).toEqual({
      subject: 'Re: Hello',
      body: { contentType: 'Text', content: 'body' },
      toRecipients: [{ emailAddress: { address: 'lead@target.com' } }],
      replyTo: [{ emailAddress: { address: 'inbox@firm.com' } }],
    });

    const [sendUrl, sendInit] = fetchMock.mock.calls[2]!;
    expect(sendUrl).toBe('https://graph.microsoft.com/v1.0/me/messages/reply-1/send');
    expect(sendInit.method).toBe('POST');
  });
});

describe('sendAs refuses a failed send', () => {
  it('throws with the status when Gmail rejects the send', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

    await expect(
      sendAs(gmailConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' }),
    ).rejects.toMatchObject({ constructor: MailboxRequestFailed, status: 403 });
  });

  it('throws with the status when Microsoft rejects the draft', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    await expect(
      sendAs(microsoftConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' }),
    ).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws with the status when Microsoft rejects the send', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1', conversationId: 'conv-1' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(
      sendAs(microsoftConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' }),
    ).rejects.toThrow('503');
  });
});

describe('sendAs when the provider never answers the send', () => {
  it('throws MailboxNoResponse when the Gmail send gets no response', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      sendAs(gmailConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' }),
    ).rejects.toBeInstanceOf(MailboxNoResponse);
  });

  it('throws MailboxNoResponse when the Microsoft send gets no response', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1', conversationId: 'conv-1' }),
      })
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      sendAs(microsoftConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' }),
    ).rejects.toBeInstanceOf(MailboxNoResponse);
  });

  it('leaves a Microsoft draft that got no response as an ordinary error, since nothing was sent', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const sending = sendAs(microsoftConnection, { to: 'lead@target.com', subject: 'Hello', text: 'body' });

    await expect(sending).rejects.toThrow('fetch failed');
    await expect(sending).rejects.not.toBeInstanceOf(MailboxNoResponse);
  });
});

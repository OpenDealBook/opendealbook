import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailbox = vi.hoisted(() => {
  class MailboxAccessDenied extends Error {}
  class MailboxRequestFailed extends Error {
    constructor(
      readonly status: number,
      action: string,
    ) {
      super(`${action} failed with status ${status}`);
    }
  }
  return {
    MailboxAccessDenied,
    MailboxRequestFailed,
    listThreadMessages: vi.fn(),
  };
});

vi.mock('@odb/mailbox', () => mailbox);

import { syncOutreachReplies } from './replies';

let account: IntegrationAccount;
let sequenceId: string;

const DAY_MS = 86_400_000;
const SENT_AT = new Date(Date.now() - 6 * DAY_MS).toISOString();
const LATER = new Date(Date.now() - 5 * DAY_MS).toISOString();
const OPERATOR = 'operator@odb.test';

beforeEach(async () => {
  mailbox.listThreadMessages.mockReset();
  account = await provisionAccount();
  await account.admin
    .from('mailbox_connection')
    .insert({
      account_id: account.accountId,
      user_id: account.userId,
      provider: 'gmail',
      nango_connection_id: 'nango-conn',
      provider_config_key: 'gmail-config',
      email_address: OPERATOR,
      status: 'active',
    })
    .throwOnError();
  const { data } = await account.admin
    .from('outreach_sequence')
    .insert({ account_id: account.accountId, name: 'Cold touch' })
    .select('id')
    .single()
    .throwOnError();
  sequenceId = data.id;
});

afterEach(async () => {
  await account.cleanup();
});

async function sentTo(
  targetEmail: string,
  threadId: string | null,
  status = 'queued',
  sentAt = SENT_AT,
  fromEmail = OPERATOR,
): Promise<string> {
  const { data } = await account.admin
    .from('outreach_enrollment')
    .insert({
      account_id: account.accountId,
      sequence_id: sequenceId,
      target_email: targetEmail,
      status,
      current_step: 2,
    })
    .select('id')
    .single()
    .throwOnError();
  await account.admin
    .from('outreach_message')
    .insert({
      enrollment_id: data.id,
      step_id: 1,
      to_email: targetEmail,
      subject: 'Quick question',
      body: 'Hi',
      status: 'sent',
      sent_at: sentAt,
      provider_thread_id: threadId,
      from_email: fromEmail,
    })
    .throwOnError();
  return data.id as string;
}

function thread(...from: string[]) {
  return [
    { providerMessageId: 'own', receivedAt: SENT_AT, fromAddress: OPERATOR },
    ...from.map((fromAddress, index) => ({
      providerMessageId: `in-${index}`,
      receivedAt: LATER,
      fromAddress,
    })),
  ];
}

async function statusOf(id: string) {
  const { data } = await account.admin
    .from('outreach_enrollment')
    .select('status')
    .eq('id', id)
    .single()
    .throwOnError();
  return data.status as string;
}

async function suppressions() {
  const { data } = await account.admin
    .from('outreach_suppression')
    .select('email, reason')
    .eq('account_id', account.accountId)
    .throwOnError();
  return data;
}

describe('syncOutreachReplies (integration)', { timeout: 120_000 }, () => {
  it('stops the sequence and suppresses the address when the target replies', async () => {
    const id = await sentTo('owner@target.test', 'thread-reply');
    mailbox.listThreadMessages.mockResolvedValue(thread('Owner@Target.test'));

    await syncOutreachReplies();

    expect(mailbox.listThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: OPERATOR }),
      'thread-reply',
    );
    expect(await statusOf(id)).toBe('replied');
    expect(await suppressions()).toEqual([{ email: 'owner@target.test', reason: 'replied' }]);
  });

  it('stops the sequence and suppresses the target when someone else answers in the thread', async () => {
    const id = await sentTo('owner@target.test', 'thread-colleague');
    mailbox.listThreadMessages.mockResolvedValue(thread('partner@target.test'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('replied');
    expect(await suppressions()).toEqual([{ email: 'owner@target.test', reason: 'replied' }]);
  });

  it('marks a finished sequence replied when the reply arrives after the last step', async () => {
    const id = await sentTo('late@target.test', 'thread-late', 'sent');
    mailbox.listThreadMessages.mockResolvedValue(thread('late@target.test'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('replied');
    expect(await suppressions()).toEqual([{ email: 'late@target.test', reason: 'replied' }]);
  });

  it('stops checking a finished sequence once its last touch is more than 30 days old', async () => {
    const id = await sentTo(
      'stale@target.test',
      'thread-stale',
      'sent',
      new Date(Date.now() - 31 * DAY_MS).toISOString(),
    );
    mailbox.listThreadMessages.mockResolvedValue(thread('stale@target.test'));

    await syncOutreachReplies();

    expect(mailbox.listThreadMessages).not.toHaveBeenCalledWith(expect.anything(), 'thread-stale');
    expect(await statusOf(id)).toBe('sent');
  });

  it('marks a finished sequence bounced when the bounce arrives after the last step', async () => {
    const id = await sentTo('lategone@target.test', 'thread-late-bounce', 'sent');
    mailbox.listThreadMessages.mockResolvedValue(thread('mailer-daemon@googlemail.com'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('bounced');
  });

  it('stops the sequence and suppresses the address when the send bounces', async () => {
    const id = await sentTo('gone@target.test', 'thread-bounce');
    mailbox.listThreadMessages.mockResolvedValue(thread('mailer-daemon@googlemail.com'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('bounced');
    expect(await suppressions()).toEqual([{ email: 'gone@target.test', reason: 'bounce' }]);
  });

  it('treats a postmaster delivery report as a bounce', async () => {
    const id = await sentTo('gone@target.test', 'thread-ndr');
    mailbox.listThreadMessages.mockResolvedValue(thread('postmaster@contoso.onmicrosoft.com'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('bounced');
  });

  it('lets a human reply win over a bounce in the same thread', async () => {
    const id = await sentTo('both@target.test', 'thread-both');
    mailbox.listThreadMessages.mockResolvedValue(
      thread('mailer-daemon@googlemail.com', 'both@target.test'),
    );

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('replied');
    expect(await suppressions()).toEqual([{ email: 'both@target.test', reason: 'replied' }]);
  });

  it('never counts a team member writing in the thread as a reply', async () => {
    const { data: member } = await account.admin.auth.admin.getUserById(account.userId);
    const id = await sentTo('owner@target.test', 'thread-teammate');
    mailbox.listThreadMessages.mockResolvedValue(thread(member.user!.email!.toUpperCase()));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('queued');
  });

  it('reads a thread only through the mailbox that sent it', async () => {
    await sentTo('owner@target.test', 'thread-old-mailbox', 'queued', SENT_AT, 'former@odb.test');
    mailbox.listThreadMessages.mockResolvedValue(thread('owner@target.test'));

    await syncOutreachReplies();

    expect(mailbox.listThreadMessages).not.toHaveBeenCalledWith(expect.anything(), 'thread-old-mailbox');
  });

  it('skips a thread that is gone and checks the rest', async () => {
    await sentTo('gone@target.test', 'thread-gone');
    const id = await sentTo('next@target.test', 'thread-next');
    mailbox.listThreadMessages.mockImplementation(async (_connection: unknown, threadId: string) => {
      if (threadId === 'thread-gone') {
        throw new mailbox.MailboxRequestFailed(404, 'Thread read');
      }
      return thread('next@target.test');
    });

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('replied');
  });

  it('keeps going past a team whose sync fails', async () => {
    await sentTo('owner@target.test', 'thread-broken');
    mailbox.listThreadMessages.mockRejectedValue(new Error('provider exploded'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(syncOutreachReplies()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(account.accountId));
    warn.mockRestore();
  });

  it('skips a send recorded before thread ids were kept', async () => {
    const id = await sentTo('legacy@target.test', null);
    mailbox.listThreadMessages.mockResolvedValue(thread('legacy@target.test'));

    await syncOutreachReplies();

    expect(mailbox.listThreadMessages).not.toHaveBeenCalledWith(expect.anything(), null);
    expect(await statusOf(id)).toBe('queued');
  });

  it('leaves the sequence running when only the team has written in the thread', async () => {
    const id = await sentTo('quiet@target.test', 'thread-quiet');
    mailbox.listThreadMessages.mockResolvedValue(thread());

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('queued');
    expect(await suppressions()).toEqual([]);
  });

  it('records one suppression when the sync runs twice', async () => {
    await sentTo('owner@target.test', 'thread-twice');
    mailbox.listThreadMessages.mockResolvedValue(thread('owner@target.test'));

    await syncOutreachReplies();
    await syncOutreachReplies();

    expect(await suppressions()).toEqual([{ email: 'owner@target.test', reason: 'replied' }]);
  });

  it('skips a team whose mailbox denies read access', async () => {
    const id = await sentTo('owner@target.test', 'thread-denied');
    mailbox.listThreadMessages.mockRejectedValue(new mailbox.MailboxAccessDenied('denied'));

    await syncOutreachReplies();

    expect(await statusOf(id)).toBe('queued');
  });
});

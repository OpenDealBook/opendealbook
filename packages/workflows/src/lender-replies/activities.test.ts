import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  class MailboxAccessDenied extends Error {}
  return {
    MailboxAccessDenied,
    tables: {} as Record<string, Record<string, unknown>[]>,
    threads: {} as Record<string, unknown>,
    listThreadMessages: vi.fn(),
  };
});

vi.mock('@odb/mailbox', () => ({
  MailboxAccessDenied: state.MailboxAccessDenied,
  listThreadMessages: state.listThreadMessages,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        not: (column: string, _operator: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return query;
        },
        upsert: (
          rows: Record<string, unknown>[],
          options: { onConflict: string },
        ) => {
          const keys = options.onConflict.split(',');
          const stored = (state.tables[table] ??= []);
          for (const row of rows) {
            const exists = stored.some((existing) =>
              keys.every((key) => existing[key] === row[key]),
            );
            if (!exists) stored.push(row);
          }
          return query;
        },
        throwOnError: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: (state.tables[table] ?? []).filter((row) =>
              filters.every((filter) => filter(row)),
            ),
            error: null,
          }),
      };
      return query;
    },
  }),
}));

import { syncLenderReplies } from './activities';

const SENT_AT = '2026-01-10T00:00:00.000Z';
const NEWER = '2026-01-11T00:00:00.000Z';
const OLDER = '2026-01-09T00:00:00.000Z';

function connection(accountId: string, emailAddress: string) {
  return {
    account_id: accountId,
    provider: 'gmail',
    nango_connection_id: `nango-${accountId}`,
    provider_config_key: 'google-mail',
    email_address: emailAddress,
    status: 'active',
  };
}

function outreach(
  accountId: string,
  roomId: string,
  threadId: string,
  status = 'sent',
) {
  return {
    account_id: accountId,
    room_id: roomId,
    sent_at: SENT_AT,
    provider_thread_id: threadId,
    status,
  };
}

function openRoom(id: string, accountId: string) {
  return { id, account_id: accountId, closed_at: null, expires_at: null };
}

function reply(id: string, receivedAt: string, fromAddress: string) {
  return { providerMessageId: id, receivedAt, fromAddress };
}

beforeEach(() => {
  state.tables = {};
  state.listThreadMessages.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('syncLenderReplies', () => {
  it('records a lender reply newer than the tracked send in an outreach thread', async () => {
    state.tables.mailbox_connection = [connection('a1', 'me@firm.com')];
    state.tables.lender_room = [openRoom('r1', 'a1')];
    state.tables.lender_room_outreach = [outreach('a1', 'r1', 't1')];
    state.listThreadMessages.mockResolvedValue([
      reply('m-sent', SENT_AT, 'me@firm.com'),
      reply('m-reply', NEWER, 'lee@bank.com'),
    ]);

    await syncLenderReplies();

    expect(state.tables.lender_room_email_reply).toEqual([
      {
        room_id: 'r1',
        account_id: 'a1',
        received_at: NEWER,
        provider_message_id: 'm-reply',
      },
    ]);
  });

  it('ignores our own mailbox address in any casing and messages not newer than the send', async () => {
    state.tables.mailbox_connection = [connection('a1', 'me@firm.com')];
    state.tables.lender_room = [openRoom('r1', 'a1')];
    state.tables.lender_room_outreach = [outreach('a1', 'r1', 't1')];
    state.listThreadMessages.mockResolvedValue([
      reply('own', NEWER, 'ME@Firm.com'),
      reply('older', OLDER, 'lee@bank.com'),
      reply('same-instant', SENT_AT, 'lee@bank.com'),
    ]);

    await syncLenderReplies();

    expect(state.tables.lender_room_email_reply ?? []).toEqual([]);
  });

  it('converges when run twice over the same thread', async () => {
    state.tables.mailbox_connection = [connection('a1', 'me@firm.com')];
    state.tables.lender_room = [openRoom('r1', 'a1')];
    state.tables.lender_room_outreach = [outreach('a1', 'r1', 't1')];
    state.listThreadMessages.mockResolvedValue([
      reply('m-reply', NEWER, 'lee@bank.com'),
    ]);

    await syncLenderReplies();
    await syncLenderReplies();

    expect(state.tables.lender_room_email_reply).toHaveLength(1);
  });

  it('skips a team whose mailbox read is denied, logs once, and still syncs other teams', async () => {
    state.tables.mailbox_connection = [
      connection('a1', 'one@firm.com'),
      connection('a2', 'two@firm.com'),
    ];
    state.tables.lender_room = [
      openRoom('r1', 'a1'),
      openRoom('r2', 'a1'),
      openRoom('r3', 'a2'),
    ];
    state.tables.lender_room_outreach = [
      outreach('a1', 'r1', 't1'),
      outreach('a1', 'r2', 't2'),
      outreach('a2', 'r3', 't3'),
    ];
    state.listThreadMessages.mockImplementation(async (conn, threadId) => {
      if (conn.emailAddress === 'one@firm.com') {
        throw new state.MailboxAccessDenied('denied');
      }
      return [reply(`m-${threadId}`, NEWER, 'lee@bank.com')];
    });

    await syncLenderReplies();

    expect(state.tables.lender_room_email_reply).toEqual([
      {
        room_id: 'r3',
        account_id: 'a2',
        received_at: NEWER,
        provider_message_id: 'm-t3',
      },
    ]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('skips closed and expired rooms and reads open ones with no or a future expiry', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    state.tables.mailbox_connection = [connection('a1', 'me@firm.com')];
    state.tables.lender_room = [
      { id: 'closed', account_id: 'a1', closed_at: past, expires_at: null },
      { id: 'expired', account_id: 'a1', closed_at: null, expires_at: past },
      { id: 'future', account_id: 'a1', closed_at: null, expires_at: future },
    ];
    state.tables.lender_room_outreach = [
      outreach('a1', 'closed', 't-closed'),
      outreach('a1', 'expired', 't-expired'),
      outreach('a1', 'future', 't-future'),
    ];
    state.listThreadMessages.mockImplementation(async (_conn, threadId) => [
      reply(`m-${threadId}`, NEWER, 'lee@bank.com'),
    ]);

    await syncLenderReplies();

    expect(
      state.tables.lender_room_email_reply!.map((row) => row.room_id),
    ).toEqual(['future']);
  });

  it('reads only threads of outreach that was sent, not sending or failed', async () => {
    state.tables.mailbox_connection = [connection('a1', 'me@firm.com')];
    state.tables.lender_room = [
      openRoom('r-sent', 'a1'),
      openRoom('r-sending', 'a1'),
      openRoom('r-failed', 'a1'),
    ];
    state.tables.lender_room_outreach = [
      outreach('a1', 'r-sent', 't-sent'),
      outreach('a1', 'r-sending', 't-sending', 'sending'),
      outreach('a1', 'r-failed', 't-failed', 'failed'),
    ];
    state.listThreadMessages.mockImplementation(async (_conn, threadId) => [
      reply(`m-${threadId}`, NEWER, 'lee@bank.com'),
    ]);

    await syncLenderReplies();

    expect(
      state.tables.lender_room_email_reply!.map((row) => row.room_id),
    ).toEqual(['r-sent']);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({ client: null as unknown }));
const mailbox = vi.hoisted(() => ({
  sendAs: (async () => ({})) as (...args: unknown[]) => Promise<unknown>,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(
        config.schema.parse(input),
        (await (caller.client as SupabaseClient<Database>).auth.getUser()).data
          .user,
      ),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

vi.mock('@odb/mailbox', () => ({
  sendAs: (...args: unknown[]) => mailbox.sendAs(...args),
}));

vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.odb.test');

import { draftLenderOutreach } from './draft-actions';
import { seedDeal, seedLender, seedRoomFor } from './seed-deal';
import { sendLenderOutreach } from './send-actions';
import { loadTeamMailbox, sendAndRecordOutreach } from './send-and-record';
import {
  addMember,
  admin,
  deleteProvisionedPeople,
  lockTeam,
  newTeam,
  provisionPerson,
  suffix,
} from './test-support';

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const READ_ONLY = 'This team is read-only until billing is updated.';
const NO_MAILBOX =
  'Connect your team mailbox before sending. Drafts still work without it.';

let owner: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let ownerId: string;
let teamId: string;
let roomId: string;
let lockedRoomId: string;
let lockedTeamId: string;
let sendAs: ReturnType<typeof vi.fn>;

async function roomOfNewTeam(teamName: string, tag: string) {
  const id = await newTeam(ownerId, teamName);
  const dealId = await seedDeal(id, `${tag} deal`);
  const domain = `${tag}-${suffix}.test`;
  await seedLender(id, domain, `${tag} Bank`, [
    { name: 'Dana Reed', email: `dana@${domain}`, isPrimary: true },
  ]);

  return {
    teamId: id,
    roomId: await seedRoomFor({ accountId: id, dealId }, `${tag} Bank`, domain),
    domain,
  };
}

async function connectMailbox(accountId: string, status = 'active') {
  await admin
    .from('mailbox_connection')
    .upsert(
      {
        account_id: accountId,
        user_id: ownerId,
        provider: 'gmail',
        nango_connection_id: 'nango-1',
        provider_config_key: 'google-mail',
        email_address: 'sam@buyer.test',
        status,
      },
      { onConflict: 'account_id' },
    )
    .throwOnError();
}

async function sentRows(forRoomId: string) {
  const { data } = await admin
    .from('lender_room_outreach')
    .select('*')
    .eq('room_id', forRoomId)
    .order('sent_at')
    .throwOnError();

  return data;
}

const review = (forRoomId: string) => ({
  roomId: forRoomId,
  subject: 'Edited subject',
  body: 'Edited body',
});

beforeAll(async () => {
  const person = await provisionPerson('send-owner');
  const colleague = await provisionPerson('send-member');
  owner = person.client;
  member = colleague.client;
  ownerId = person.userId;
  caller.client = owner;

  const main = await roomOfNewTeam('send-team', 'main');
  teamId = main.teamId;
  roomId = main.roomId;
  await addMember(teamId, colleague.userId);

  const locked = await roomOfNewTeam('send-locked', 'locked');
  lockedTeamId = locked.teamId;
  lockedRoomId = locked.roomId;
  await connectMailbox(lockedTeamId);
  await lockTeam(lockedTeamId);
});

afterAll(deleteProvisionedPeople);

describe('sendLenderOutreach', () => {
  it('refuses, and tells them to connect the team mailbox, when none is connected', async () => {
    sendAs = vi.fn(async () => ({ providerMessageId: 'pm-1', threadId: 'th-1' }));
    mailbox.sendAs = sendAs as never;

    expect(await sendLenderOutreach(review(roomId))).toEqual({
      ok: false,
      refusal: NO_MAILBOX,
    });
    expect(sendAs).not.toHaveBeenCalled();
    expect(await sentRows(roomId)).toEqual([]);
  });

  it('does not count a mailbox that is not active as connected', async () => {
    await connectMailbox(teamId, 'error');

    expect(await sendLenderOutreach(review(roomId))).toEqual({
      ok: false,
      refusal: NO_MAILBOX,
    });
    expect(sendAs).not.toHaveBeenCalled();
  });

  it("sends the reviewed email to the lender's primary contact from the team mailbox, replies to that inbox, and records it", async () => {
    await connectMailbox(teamId);

    await expect(sendLenderOutreach(review(roomId))).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    expect(sendAs).toHaveBeenCalledTimes(1);
    expect(sendAs).toHaveBeenCalledWith(
      {
        provider: 'gmail',
        nangoConnectionId: 'nango-1',
        providerConfigKey: 'google-mail',
        emailAddress: 'sam@buyer.test',
      },
      {
        to: `dana@main-${suffix}.test`,
        subject: 'Edited subject',
        text: 'Edited body',
        replyTo: 'sam@buyer.test',
      },
    );
    expect(await sentRows(roomId)).toMatchObject([
      {
        room_id: roomId,
        account_id: teamId,
        to_email: `dana@main-${suffix}.test`,
        subject: 'Edited subject',
        body: 'Edited body',
        kind: 'outreach',
        status: 'sent',
        provider_message_id: 'pm-1',
        provider_thread_id: 'th-1',
      },
    ]);
  });

  it('shows the last send on the draft', async () => {
    const [{ sent_at }] = (await sentRows(roomId)) as unknown as [{ sent_at: string }];
    const [{ deal_id }] = (await admin
      .from('lender_room')
      .select('deal_id')
      .eq('id', roomId)
      .throwOnError()
      .then((result) => result.data)) as [{ deal_id: string }];

    const drafts = await draftLenderOutreach({ dealId: deal_id });

    expect(drafts).toMatchObject({
      ok: true,
      value: { drafts: [{ roomId, lastSentAt: sent_at }] },
    });
  });

  it('asks for confirmation before sending to a room again, and sends once confirmed', async () => {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });

    expect(await sendLenderOutreach(review(roomId))).toEqual({
      ok: false,
      refusal: `Already sent on ${today}. Send again?`,
    });
    expect(sendAs).toHaveBeenCalledTimes(1);
    expect(await sentRows(roomId)).toHaveLength(1);

    await sendLenderOutreach({ ...review(roomId), confirmResend: true });

    expect(sendAs).toHaveBeenCalledTimes(2);
    expect(await sentRows(roomId)).toHaveLength(2);
  });

  it('refuses anyone but the deal team', async () => {
    caller.client = member;

    expect(await sendLenderOutreach(review(roomId))).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });
    expect(sendAs).toHaveBeenCalledTimes(2);

    caller.client = owner;
  });

  it('refuses while the team is in billing lock', async () => {
    await turnTeamBillingOn(admin);

    expect(await sendLenderOutreach(review(lockedRoomId))).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(sendAs).toHaveBeenCalledTimes(2);
    expect(await sentRows(lockedRoomId)).toEqual([]);
  });

  it('records the email before handing it to the mailbox', async () => {
    const seen: Array<string | undefined> = [];
    mailbox.sendAs = async () => {
      seen.push((await sentRows(roomId)).at(-1)?.status);
      return { providerMessageId: 'pm-2', threadId: 'th-2' };
    };

    await sendLenderOutreach({ ...review(roomId), confirmResend: true });

    expect(seen).toEqual(['sending']);
    expect((await sentRows(roomId)).at(-1)).toMatchObject({
      status: 'sent',
      provider_message_id: 'pm-2',
    });
  });

  it('marks the record failed, refuses politely, and does not count it as sent when the mailbox fails', async () => {
    const before = await sentRows(roomId);
    mailbox.sendAs = async () => {
      throw new Error('mailbox down');
    };

    expect(
      await sendLenderOutreach({ ...review(roomId), confirmResend: true }),
    ).toEqual({ ok: false, refusal: "Couldn't send from your mailbox. Try again." });

    const rows = await sentRows(roomId);
    expect(rows).toHaveLength(before.length + 1);
    expect(rows.at(-1)).toMatchObject({
      status: 'failed',
      provider_message_id: null,
      provider_thread_id: null,
    });
    expect(rows.filter((row) => row.status === 'sent')).toHaveLength(
      before.length,
    );
  });

  it('does not ask for confirmation when the only earlier attempt failed', async () => {
    const fresh = await roomOfNewTeam('send-fresh', 'fresh');
    await connectMailbox(fresh.teamId);
    mailbox.sendAs = async () => {
      throw new Error('mailbox down');
    };
    await sendLenderOutreach(review(fresh.roomId));
    mailbox.sendAs = async () => ({ providerMessageId: 'pm-f', threadId: 'th-f' });

    await expect(sendLenderOutreach(review(fresh.roomId))).resolves.toMatchObject({
      ok: true,
    });
  });

  it('sends to the lender the room is linked to, not whichever lender shares its domain', async () => {
    await connectMailbox(teamId);
    sendAs = vi.fn(async () => ({ providerMessageId: 'pm-l', threadId: 'th-l' }));
    mailbox.sendAs = sendAs as never;
    const linkedDomain = `linked-${suffix}.test`;
    await seedLender(teamId, linkedDomain, 'Linked Bank', [
      { name: 'Lee Linked', email: `lee@${linkedDomain}`, isPrimary: true },
    ]);
    const { data: linked } = await admin
      .from('lender')
      .select('id')
      .eq('account_id', teamId)
      .eq('domain', linkedDomain)
      .single()
      .throwOnError();
    const { data: first } = await admin
      .from('lender_room')
      .select('deal_id')
      .eq('id', roomId)
      .single()
      .throwOnError();
    const relinked = await seedRoomFor(
      { accountId: teamId, dealId: first.deal_id },
      'Relinked Bank',
      `relinked-${suffix}.test`,
    );
    await admin
      .from('lender_room')
      .update({ lender_id: linked.id })
      .eq('id', relinked)
      .throwOnError();

    await expect(sendLenderOutreach(review(relinked))).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    expect(sendAs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: `lee@${linkedDomain}` }),
    );
  });
});

describe('a nudge', () => {
  it('never counts as the first outreach', async () => {
    const fresh = await roomOfNewTeam('send-nudged', 'nudged');
    await connectMailbox(fresh.teamId);
    mailbox.sendAs = async () => ({ providerMessageId: 'pm-x', threadId: 'th-x' });
    await sendAndRecordOutreach(owner, {
      kind: 'nudge',
      accountId: fresh.teamId,
      sentBy: ownerId,
      roomIds: [fresh.roomId],
      connection: (await loadTeamMailbox(owner, fresh.teamId))!,
      email: { to: `dana@${fresh.domain}`, subject: 'Nudge', body: 'Hello' },
    });
    const { data: room } = await admin
      .from('lender_room')
      .select('deal_id')
      .eq('id', fresh.roomId)
      .single()
      .throwOnError();

    const drafts = await draftLenderOutreach({ dealId: room.deal_id });

    expect(drafts).toMatchObject({
      ok: true,
      value: { drafts: [{ lastSentAt: null }] },
    });
    await expect(sendLenderOutreach(review(fresh.roomId))).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe('sendAndRecordOutreach', () => {
  it('sends one email and records one nudge row for each room it covers', async () => {
    sendAs = vi.fn(async () => ({ providerMessageId: 'pm-n', threadId: 'th-n' }));
    mailbox.sendAs = sendAs as never;
    const { data: first } = await admin
      .from('lender_room')
      .select('deal_id')
      .eq('id', roomId)
      .single()
      .throwOnError();
    const secondRoom = await seedRoomFor(
      { accountId: teamId, dealId: first.deal_id },
      'Second Bank',
      `second-${suffix}.test`,
    );
    const connection = (await loadTeamMailbox(owner, teamId))!;

    await sendAndRecordOutreach(owner, {
      kind: 'nudge',
      accountId: teamId,
      sentBy: ownerId,
      roomIds: [roomId, secondRoom],
      connection,
      email: { to: 'dana@first.test', subject: 'Checking in', body: 'Any news?' },
    });

    expect(sendAs).toHaveBeenCalledTimes(1);
    for (const covered of [roomId, secondRoom]) {
      expect((await sentRows(covered)).at(-1)).toMatchObject({
        kind: 'nudge',
        status: 'sent',
        to_email: 'dana@first.test',
        subject: 'Checking in',
        body: 'Any news?',
        provider_message_id: 'pm-n',
        provider_thread_id: 'th-n',
      });
    }
  });
});

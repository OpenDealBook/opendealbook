import type { SupabaseClient } from '@supabase/supabase-js';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { appendEvent, seedDeal, seedLender, seedRoomFor } from '../seed-deal';
import {
  addMember,
  admin,
  deleteProvisionedPeople,
  newTeam,
  provisionPerson,
  suffix,
} from '../test-support';
import { draftLenderNudges } from './draft-actions';
import { sendLenderNudge } from './send-actions';

const DAY = 86_400_000;
const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const NO_MAILBOX =
  'Connect your team mailbox before sending. Drafts still work without it.';
const CANNOT_DRAFT = 'Save this lender with a primary contact to draft';

let owner: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let ownerId: string;
let ourName: string;
let teamId: string;
let acmeLenderId: string;
let quietLenderId: string;
let hvacRoom: string;
let bakeryRoom: string;

const domains = {
  acme: `acme-${suffix}.test`,
  quiet: `quiet-${suffix}.test`,
  unsaved: `unsaved-${suffix}.test`,
};

async function ageRoom(roomId: string, daysAgo: number) {
  const db = new pg.Client({
    connectionString:
      process.env.SUPABASE_DB_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await db.connect();
  try {
    await db.query('begin');
    await db.query('set local session_replication_role = replica');
    await db.query(
      'update public.lender_room set created_at = now() - make_interval(days => $2) where id = $1',
      [roomId, daysAgo],
    );
    await db.query('commit');
  } finally {
    await db.end();
  }
}

async function outreachSent(
  roomId: string,
  daysAgo: number,
  thread: { id: string; subject: string },
) {
  await admin
    .from('lender_room_outreach')
    .insert({
      room_id: roomId,
      account_id: teamId,
      sent_by: ownerId,
      sent_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
      kind: 'outreach',
      status: 'sent',
      to_email: 'dana@acme.test',
      subject: thread.subject,
      body: 'Hello',
      provider_message_id: `pm-${thread.id}`,
      provider_thread_id: thread.id,
    })
    .throwOnError();
}

async function quietRoom(
  dealId: string,
  name: string,
  domain: string,
  daysAgo: number,
  thread: { id: string; subject: string },
) {
  const roomId = await seedRoomFor({ accountId: teamId, dealId }, name, domain);
  await ageRoom(roomId, daysAgo);
  await outreachSent(roomId, daysAgo, thread);

  return roomId;
}

async function lenderId(domain: string) {
  const { data } = await admin
    .from('lender')
    .select('id')
    .eq('account_id', teamId)
    .eq('domain', domain)
    .single()
    .throwOnError();

  return data.id;
}

async function connectMailbox() {
  await admin
    .from('mailbox_connection')
    .upsert(
      {
        account_id: teamId,
        user_id: ownerId,
        provider: 'gmail',
        nango_connection_id: 'nango-1',
        provider_config_key: 'google-mail',
        email_address: 'sam@buyer.test',
        status: 'active',
      },
      { onConflict: 'account_id' },
    )
    .throwOnError();
}

async function lastRow(roomId: string) {
  const { data } = await admin
    .from('lender_room_outreach')
    .select('*')
    .eq('room_id', roomId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  return data;
}

const nudge = (subject = 'Re: Corner bakery: financing') => ({
  accountId: teamId,
  lenderId: acmeLenderId,
  subject,
  body: 'Edited nudge',
});

beforeAll(async () => {
  const person = await provisionPerson('nudge-owner');
  const colleague = await provisionPerson('nudge-member');
  owner = person.client;
  member = colleague.client;
  ownerId = person.userId;
  caller.client = owner;

  const { data: personal } = await admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', ownerId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();
  ourName = personal.name;

  teamId = await newTeam(ownerId, 'nudge-team');
  await addMember(teamId, colleague.userId);

  await seedLender(teamId, domains.acme, 'Acme Lending', [
    { name: 'Dana Reed', email: `dana@${domains.acme}`, isPrimary: true },
  ]);
  acmeLenderId = await lenderId(domains.acme);
  await seedLender(teamId, domains.quiet, 'Quiet Bank', []);
  quietLenderId = await lenderId(domains.quiet);
  await admin
    .from('lender_contact')
    .insert({
      account_id: teamId,
      lender_id: quietLenderId,
      name: 'No Email',
      is_primary: true,
    })
    .throwOnError();

  const hvacDeal = await seedDeal(teamId, 'Acme HVAC');
  const bakeryDeal = await seedDeal(teamId, 'Corner Bakery');
  await appendEvent(bakeryDeal, bakeryDeal, 'deal', 'deal.updated', {
    code_name: 'Project Kestrel',
    description: 'Zanzibar-private-description',
  });

  hvacRoom = await quietRoom(hvacDeal, 'Acme Lending', domains.acme, 12, {
    id: 'th-old',
    subject: 'Acme HVAC: financing',
  });
  bakeryRoom = await quietRoom(bakeryDeal, 'Acme Lending', domains.acme, 7, {
    id: 'th-new',
    subject: 'Corner bakery: financing',
  });
  await quietRoom(hvacDeal, 'Quiet Bank', domains.quiet, 20, {
    id: 'th-quiet',
    subject: 'Acme HVAC: financing',
  });
  await quietRoom(bakeryDeal, 'Unsaved Bank', domains.unsaved, 15, {
    id: 'th-unsaved',
    subject: 'Corner bakery: financing',
  });
});

afterAll(async () => {
  await admin.from('lender_room').delete().eq('account_id', teamId);
  await deleteProvisionedPeople();
});

describe('draftLenderNudges', () => {
  it('drafts one nudge per lender to its primary contact, replying to the latest outreach thread and listing every quiet deal', async () => {
    expect(await draftLenderNudges({ accountId: teamId })).toMatchObject({
      ok: true,
      value: {
        drafts: [
          {
            lenderId: acmeLenderId,
            lenderName: 'Acme Lending',
            to: `dana@${domains.acme}`,
            subject: 'Re: Corner bakery: financing',
          },
        ],
      },
    });

    const result = await draftLenderNudges({ accountId: teamId });
    const [draft] = result.ok ? result.value.drafts : [];
    expect(draft!.body).toContain('Hi Dana Reed,');
    expect(draft!.body).toContain('Acme HVAC, 12 days; Project Kestrel, 7 days');
    expect(draft!.body).not.toContain('Corner Bakery');
    expect(draft!.body).not.toContain('Zanzibar-private-description');
    expect(draft!.body).toContain(`Thanks,\n${ourName}`);
  });

  it('lists lenders it cannot draft for, with the reason: no primary contact email', async () => {
    expect(await draftLenderNudges({ accountId: teamId })).toMatchObject({
      ok: true,
      value: {
        cannotDraft: [
          { lenderId: quietLenderId, lenderName: 'Quiet Bank', reason: CANNOT_DRAFT },
          { lenderId: null, lenderName: 'Unsaved Bank', reason: CANNOT_DRAFT },
        ],
      },
    });
  });

  it('refuses anyone but the deal team', async () => {
    caller.client = member;
    const result = await draftLenderNudges({ accountId: teamId });
    caller.client = owner;

    expect(result).toEqual({ ok: false, refusal: DEAL_TEAM_ONLY });
  });
});

describe('sendLenderNudge', () => {
  it('refuses, and tells them to connect the team mailbox, when none is connected', async () => {
    const sendAs = vi.fn();
    mailbox.sendAs = sendAs as never;

    expect(await sendLenderNudge(nudge())).toEqual({
      ok: false,
      refusal: NO_MAILBOX,
    });
    expect(sendAs).not.toHaveBeenCalled();
  });

  it('refuses anyone but the deal team', async () => {
    await connectMailbox();
    const sendAs = vi.fn();
    mailbox.sendAs = sendAs as never;
    caller.client = member;
    const result = await sendLenderNudge(nudge());
    caller.client = owner;

    expect(result).toEqual({ ok: false, refusal: DEAL_TEAM_ONLY });
    expect(sendAs).not.toHaveBeenCalled();
  });

  it('marks the nudge failed on every room, refuses politely, and keeps the lender due when the mailbox fails', async () => {
    mailbox.sendAs = async () => {
      throw new Error('mailbox down');
    };

    expect(await sendLenderNudge(nudge())).toEqual({
      ok: false,
      refusal: "Couldn't send from your mailbox. Try again.",
    });

    for (const room of [hvacRoom, bakeryRoom]) {
      expect(await lastRow(room)).toMatchObject({ kind: 'nudge', status: 'failed' });
    }
    expect(await draftLenderNudges({ accountId: teamId })).toMatchObject({
      value: { drafts: [{ lenderId: acmeLenderId }] },
    });
  });

  it('sends the reviewed nudge once as a reply in the latest outreach thread, records it on every quiet room, and resets their clocks', async () => {
    const sendAs = vi.fn(async () => ({
      providerMessageId: 'pm-nudge',
      threadId: 'th-new',
    }));
    mailbox.sendAs = sendAs as never;

    await expect(sendLenderNudge(nudge())).resolves.toEqual({
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
        to: `dana@${domains.acme}`,
        subject: 'Re: Corner bakery: financing',
        text: 'Edited nudge',
        replyTo: 'sam@buyer.test',
        inThread: 'th-new',
      },
    );
    for (const room of [hvacRoom, bakeryRoom]) {
      expect(await lastRow(room)).toMatchObject({
        kind: 'nudge',
        status: 'sent',
        to_email: `dana@${domains.acme}`,
        subject: 'Re: Corner bakery: financing',
        body: 'Edited nudge',
        provider_message_id: 'pm-nudge',
        provider_thread_id: 'th-new',
      });
    }
    expect(await draftLenderNudges({ accountId: teamId })).toMatchObject({
      value: { drafts: [] },
    });
  });

  it('refuses politely and sends nothing when the lender is no longer due', async () => {
    const sendAs = vi.fn();
    mailbox.sendAs = sendAs as never;

    expect(await sendLenderNudge(nudge())).toEqual({
      ok: false,
      refusal: "This lender isn't due a nudge anymore.",
    });
    expect(sendAs).not.toHaveBeenCalled();
    expect(await lastRow(hvacRoom)).toMatchObject({ provider_message_id: 'pm-nudge' });
  });
});

import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import '../../test-support/integration-harness';

import { failStaleSendingOutreach } from './failStaleSending';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const MINUTE = 60_000;
const unique = crypto.randomUUID().slice(0, 8);
const BRAND_DOMAIN = `stale-${unique}.test`;

let ownerId: string;
let teamId: string;
let roomId: string;

async function stage(status: 'sending' | 'sent', ageMinutes: number): Promise<string> {
  const { data } = await admin
    .from('lender_room_outreach')
    .insert({
      room_id: roomId,
      account_id: teamId,
      status,
      sent_at: new Date(Date.now() - ageMinutes * MINUTE).toISOString(),
      to_email: 'lee@bank.test',
      subject: 'Hello',
      body: 'Body',
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function statusOf(id: string): Promise<string> {
  const { data } = await admin
    .from('lender_room_outreach')
    .select('status')
    .eq('id', id)
    .single()
    .throwOnError();

  return data.status;
}

beforeAll(async () => {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `int-stale-${unique}@odb.test`,
    password: `Pw-${unique}-Aa1!`,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  ownerId = created.user.id;

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: `Stale ${unique}`,
      user_id: ownerId,
      account_slug: `stale-${unique}`,
    })
    .throwOnError();
  teamId = team.id;

  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Stale deal' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        firm_id: firm.id,
        account_id: teamId,
        owner_user_id: ownerId,
        description: 'Stale deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Room' })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('lender_brand')
    .insert({ domain: BRAND_DOMAIN, name: 'Stale Bank' })
    .throwOnError();

  const { data: room } = await admin
    .from('lender_room')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      name: 'Stale Bank',
      brand_domain: BRAND_DOMAIN,
      private_folder_id: folder.id,
    })
    .select('id')
    .single()
    .throwOnError();
  roomId = room.id;
}, 60_000);

afterAll(async () => {
  await admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await admin.from('lender_brand').delete().eq('domain', BRAND_DOMAIN);
  await admin.auth.admin.deleteUser(ownerId);
});

describe('failStaleSendingOutreach', () => {
  it('fails sending rows older than 15 minutes and leaves fresh and sent rows alone', async () => {
    const stale = await stage('sending', 16);
    const fresh = await stage('sending', 5);
    const sent = await stage('sent', 60);

    await failStaleSendingOutreach();
    await failStaleSendingOutreach();

    expect(await statusOf(stale)).toBe('failed');
    expect(await statusOf(fresh)).toBe('sending');
    expect(await statusOf(sent)).toBe('sent');
  });
});

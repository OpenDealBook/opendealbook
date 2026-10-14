import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;

type Client = SupabaseClient<Database>;

export const admin: Client = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export interface Person {
  client: Client;
  userId: string;
  email: string;
}

export async function provisionPerson(): Promise<Person> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-ask-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw error;
  }

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    throw signIn.error;
  }

  const person = { client, userId: created.user.id, email };
  people.push(person);

  return person;
}

const people: Person[] = [];
const dealAccountIds: string[] = [];

export async function removeEverythingSeeded() {
  for (const table of ['lender_room', 'lender_package', 'dr_folder'] as const) {
    await admin
      .from(table)
      .delete()
      .in('account_id', dealAccountIds)
      .throwOnError();
  }

  for (const person of people) {
    const { error } = await admin.auth.admin.deleteUser(person.userId);
    if (error) {
      throw error;
    }
  }
}

async function seedDeal(accountId: string) {
  dealAccountIds.push(accountId);
  const dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: { account_id: accountId, description: 'Lender asks deal' },
      p_actor_kind: 'service',
      p_actor_via: 'integration-test',
    })
    .throwOnError();

  return { accountId, dealId };
}

export async function seedPersonalDeal(owner: Person) {
  const { data: account } = await admin
    .from('accounts')
    .select('id')
    .eq('primary_owner_user_id', owner.userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return seedDeal(account.id);
}

export async function seedTeamDeal(
  owner: Person,
  colleague: Person,
): Promise<{ accountId: string; dealId: string }> {
  const unique = crypto.randomUUID().slice(0, 8);
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: `Asks ${unique}`,
      user_id: owner.userId,
    })
    .throwOnError();

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: team.id,
      user_id: colleague.userId,
      account_role: 'member',
    })
    .throwOnError();

  return seedDeal(team.id);
}

export async function seedFolder(
  deal: { accountId: string; dealId: string },
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const { data } = await admin
    .from('dr_folder')
    .insert({
      account_id: deal.accountId,
      deal_id: deal.dealId,
      name,
      parent_id: parentId,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

export async function seedDocument(
  deal: { dealId: string },
  folderId: string,
  name: string,
): Promise<string> {
  const documentId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: deal.dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: documentId,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${deal.dealId}/${documentId}-${name}`,
      },
      p_actor_kind: 'service',
      p_actor_via: 'integration-test',
    })
    .throwOnError();

  return documentId;
}

export async function seedRoom(
  deal: { accountId: string; dealId: string },
  name: string,
  members: Person[],
): Promise<{ roomId: string; privateFolderId: string }> {
  const privateFolderId = await seedFolder(deal, name);
  const { data: room } = await admin
    .from('lender_room')
    .insert({
      account_id: deal.accountId,
      deal_id: deal.dealId,
      name,
      private_folder_id: privateFolderId,
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('lender_room_member')
    .insert(
      members.map((member) => ({
        room_id: room.id,
        user_id: member.userId,
        email: member.email,
      })),
    )
    .throwOnError();

  return { roomId: room.id, privateFolderId };
}

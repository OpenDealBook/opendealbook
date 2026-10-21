import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const session = { persistSession: false, autoRefreshToken: false };
const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: session,
});

const world = vi.hoisted(() => ({ client: null as unknown, userId: '' }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: world.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.client,
  getSupabaseServerAdminClient: () => admin,
}));

const { uploadDocument } = await import('./actions');

const userIds: string[] = [];
let teamId: string;
let dealId: string;
let counselFolderId: string;
let teamFolderId: string;

async function signedInPerson(): Promise<{
  client: SupabaseClient<Database>;
  userId: string;
}> {
  const email = `dr-${crypto.randomUUID().slice(0, 8)}@odb.test`;
  const password = `Pw-${crypto.randomUUID()}-Aa1!`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  userIds.push(data.user!.id);

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: session,
  });
  await client.auth.signInWithPassword({ email, password });

  return { client, userId: data.user!.id };
}

beforeAll(async () => {
  const owner = await signedInPerson();
  const analyst = await signedInPerson();

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: 'Data room team',
      user_id: owner.userId,
      account_slug: `dr-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();
  teamId = team.id;
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: analyst.userId,
      account_role: 'analyst',
    })
    .throwOnError();

  dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: { account_id: teamId, owner_user_id: owner.userId },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: folderId } = await admin
    .rpc('ensure_counsel_uploads_folder', { deal_id: dealId })
    .throwOnError();
  counselFolderId = folderId;

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Financials archive' })
    .select('id')
    .single()
    .throwOnError();
  teamFolderId = folder.id;

  world.client = analyst.client;
  world.userId = analyst.userId;
});

afterAll(async () => {
  await admin.from('accounts').delete().eq('id', teamId);
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

it("refuses an analyst's upload into a counsel folder and keeps no stored file", async () => {
  const result = await uploadDocument({
    dealId,
    folderId: counselFolderId,
    name: 'draft.pdf',
    body: new Uint8Array([1, 2, 3]),
  });

  const { data: stored } = await admin.storage
    .from('data-room')
    .list(`deal/${dealId}`);

  expect(result).toEqual({
    ok: false,
    refusal: expect.stringMatching(
      /^Only deal managers can upload documents\. Ask /,
    ),
  });
  expect(stored).toEqual([]);
});

it('stores a file whose name storage keys cannot hold, keeping its name', async () => {
  const result = await uploadDocument({
    dealId,
    folderId: teamFolderId,
    name: '[Example] P&L.pdf',
    body: new Uint8Array([1, 2, 3]),
  });

  const { data: document } = await admin
    .from('dr_document')
    .select('name, storage_path')
    .eq('deal_id', dealId)
    .eq('folder_id', teamFolderId)
    .single()
    .throwOnError();
  const { data: stored } = await admin.storage
    .from('data-room')
    .download(document.storage_path);

  expect(result).toMatchObject({ ok: true });
  expect(document.name).toBe('[Example] P&L.pdf');
  expect(stored?.size).toBe(3);
});

it('links a file uploaded into a checklist item to that item and marks it received', async () => {
  const itemId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'checklist_item',
      p_aggregate_id: itemId,
      p_event_type: 'checklist_item.added',
      p_payload: { title: 'Tax returns' },
      p_actor_kind: 'service',
    })
    .throwOnError();

  await uploadDocument({
    dealId,
    folderId: teamFolderId,
    name: 'returns.pdf',
    body: new Uint8Array([1]),
    checklistItemId: itemId,
  });

  const { data: document } = await admin
    .from('dr_document')
    .select('id')
    .eq('deal_id', dealId)
    .eq('name', 'returns.pdf')
    .single()
    .throwOnError();
  const { data: item } = await admin
    .from('checklist_item')
    .select('linked_document_id, status')
    .eq('id', itemId)
    .single()
    .throwOnError();

  expect(item).toEqual({ linked_document_id: document.id, status: 'received' });
});

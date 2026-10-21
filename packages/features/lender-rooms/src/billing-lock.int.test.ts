import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';

import { unwrap } from './actions/test-support/unwrap';

type Client = SupabaseClient<Database>;

const session = vi.hoisted(() => ({
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.user,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => session.admin,
}));

import { setManualLenderLogo } from './brand/actions';
import { cancelFormSignature, requestFormSignature } from './esign/actions';
import { beginUpload } from './uploads/actions';
import { createFolder } from './uploads/folder-actions';
import { removePackageFile } from './uploads/package-actions';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const READ_ONLY = 'This team is read-only until billing is updated.';
const BRAND_DOMAIN = `locked-${crypto.randomUUID().slice(0, 8)}.test`;

const admin: Client = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Person {
  client: Client;
  userId: string;
}

let owner: Person;
let lender: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let roomFolderId: string;
let packageFolderId: string;
let documentId: string;
let formId: string;
let signatureId: string;

async function provisionPerson(): Promise<Person> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-lock-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) {
    throw created.error;
  }

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.data.user.id };
}

async function newFolder(name: string, parentId?: string): Promise<string> {
  const folder = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name, parent_id: parentId })
    .select('id')
    .single()
    .throwOnError();

  return folder.data.id;
}

beforeAll(async () => {
  session.admin = admin;
  [owner, lender] = await Promise.all([provisionPerson(), provisionPerson()]);

  const team = await admin
    .rpc('create_team_account', {
      account_name: `Locked lenders ${crypto.randomUUID().slice(0, 8)}`,
      user_id: owner.userId,
    })
    .throwOnError();
  teamId = team.data.id;

  dealId = crypto.randomUUID();
  await appendDealEvent(owner.client, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: teamId,
      owner_user_id: owner.userId,
      firm_id: null,
      description: 'Locked team deal',
      source: 'manual',
      stage: 'sourcing',
    },
  });

  packageFolderId = await newFolder('Lender package');
  await admin
    .from('lender_package')
    .insert({ deal_id: dealId, account_id: teamId, master_folder_id: packageFolderId })
    .throwOnError();

  documentId = crypto.randomUUID();
  await appendDealEvent(owner.client, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: documentId,
    eventType: 'dr_document.added',
    payload: {
      folder_id: packageFolderId,
      name: 'cim.pdf',
      storage_path: `deal/${dealId}/cim.pdf`,
      version: 1,
    },
  });

  await admin
    .from('lender_brand')
    .insert({ domain: BRAND_DOMAIN, name: 'Locked Bank' })
    .throwOnError();

  roomFolderId = await newFolder('Locked Bank');
  const room = await admin
    .from('lender_room')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      name: 'Locked Bank',
      brand_domain: BRAND_DOMAIN,
      private_folder_id: roomFolderId,
    })
    .select('id')
    .single()
    .throwOnError();
  roomId = room.data.id;

  await admin
    .from('lender_room_member')
    .insert({ room_id: roomId, user_id: lender.userId, email: `${lender.userId}@odb.test` })
    .throwOnError();

  const form = await admin
    .from('lender_ask')
    .insert({
      room_id: roomId,
      account_id: teamId,
      kind: 'form',
      title: 'Application',
      return_route: 'esign',
      created_by: lender.userId,
    })
    .select('id')
    .single()
    .throwOnError();
  formId = form.data.id;

  const signature = await admin
    .from('lender_form_signature')
    .insert({
      ask_id: formId,
      documenso_document_id: 'documenso-locked',
      signers: [{ name: 'Ann', email: 'ann@odb.test' }],
      status: 'draft',
      editor_url: 'https://documenso.test/edit',
    })
    .select('id')
    .single()
    .throwOnError();
  signatureId = signature.data.id;

  await admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
    .eq('id', teamId)
    .throwOnError();
}, 60_000);

afterAll(async () => {
  await admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await admin.from('lender_brand').delete().eq('domain', BRAND_DOMAIN).throwOnError();
  await admin
    .from('lender_upload')
    .delete()
    .eq('uploaded_by', lender.userId)
    .throwOnError();
  await Promise.all(
    [owner, lender].map((person) => admin.auth.admin.deleteUser(person.userId)),
  );
});

describe('a locked team in its lender rooms', { timeout: 60_000 }, () => {
  beforeEach(() => turnTeamBillingOn(admin));

  it('cannot add a folder to the lender package', async () => {
    session.user = owner.client;

    await expect(
      unwrap(createFolder({ dealId, parentFolderId: packageFolderId, name: 'New' })),
    ).rejects.toThrow(READ_ONLY);
  });

  it('cannot upload into its lender room', async () => {
    session.user = owner.client;

    await expect(
      unwrap(beginUpload({ roomId, folderId: roomFolderId, name: 'answer.pdf', size: 6 })),
    ).rejects.toThrow(READ_ONLY);
  });

  it('cannot remove a file from the lender package', async () => {
    session.user = owner.client;

    await expect(unwrap(removePackageFile({ dealId, documentId }))).rejects.toThrow(
      READ_ONLY,
    );
  });

  it('cannot send a form for signature', async () => {
    session.user = owner.client;

    await expect(
      unwrap(
        requestFormSignature({
          formId,
          signers: [{ name: 'Ann', email: 'ann@odb.test' }],
        }),
      ),
    ).rejects.toThrow(READ_ONLY);
  });

  it('cannot cancel a signature request', async () => {
    session.user = owner.client;

    await expect(unwrap(cancelFormSignature({ signatureId }))).rejects.toThrow(
      READ_ONLY,
    );
  });

  it('cannot set a lender logo', async () => {
    session.user = owner.client;

    await expect(
      unwrap(
        setManualLenderLogo({
          dealId,
          roomId,
          file: new File(['png'], 'logo.png', { type: 'image/png' }),
        }),
      ),
    ).rejects.toThrow(READ_ONLY);
  });

  it('still lets its lender upload into the room', async () => {
    session.user = lender.client;

    const upload = await unwrap(
      beginUpload({ roomId, folderId: roomFolderId, name: 'bank-form.pdf', size: 4 }),
    );

    expect(upload.uploadId).toEqual(expect.any(String));
  });
});

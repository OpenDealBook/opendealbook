import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';
import type { Database } from '@odb/supabase';

import {
  loadCounselActivity,
  respondToBuyerCounselDocumentRequest,
} from './documents';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let member: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let teamId: string;
let dealId: string;
let teamDocument: string;
let lenderDocument: string;

async function addDocument(folderId: string, name: string): Promise<string> {
  const path = `deal/${dealId}/${crypto.randomUUID()}-${name}`;

  await admin.storage
    .from('data-room')
    .upload(path, new TextEncoder().encode('%PDF-1.4\n'))
    .then(({ error }) => {
      if (error) throw error;
    });

  const id = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_actor_kind: 'service',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: path,
        version: 1,
        uploaded_by: null,
      },
    })
    .throwOnError();

  return id;
}

async function folder(name: string): Promise<string> {
  const { data } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

function fetchAs(
  person: Person | null,
  documentId: string,
  disposition = 'download',
) {
  return respondToBuyerCounselDocumentRequest({
    client: person?.client ?? createClient<Database>(SUPABASE_URL, ANON_KEY),
    admin,
    request: new Request(
      `http://localhost/counsel/${dealId}/data-room/files/${documentId}?disposition=${disposition}`,
    ),
    dealId,
    documentId,
  });
}

async function tracked() {
  const { data } = await admin
    .from('counsel_activity')
    .select('user_id, action, dr_document_id')
    .eq('deal_id', dealId)
    .order('created_at')
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();

  await admin
    .from('deal_counsel')
    .insert([
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
        name: 'Bea Buyerlaw',
      },
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      },
    ])
    .throwOnError();

  const bankFolder = await folder('Bank');

  await admin
    .from('lender_room')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      name: 'Bank',
      private_folder_id: bankFolder,
    })
    .throwOnError();

  teamDocument = await addDocument(await folder('Financials'), 'returns.pdf');
  lenderDocument = await addDocument(bankFolder, 'bank-only.pdf');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe("buyer's counsel opening a data room file", () => {
  it("sends buyer's counsel to the file and tracks the download for the team", async () => {
    const response = await fetchAs(buyerCounsel, teamDocument);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain(
      '/storage/v1/object/sign/data-room/',
    );
    expect(await tracked()).toEqual([
      {
        user_id: buyerCounsel.userId,
        action: 'document_downloaded',
        dr_document_id: teamDocument,
      },
    ]);
  });

  it('tracks a preview as a preview', async () => {
    await fetchAs(buyerCounsel, teamDocument, 'preview');

    expect((await tracked()).at(-1)?.action).toBe('document_previewed');
  });

  it("hides a file in a lender room's own folder", async () => {
    expect((await fetchAs(buyerCounsel, lenderDocument)).status).toBe(404);
  });

  it("hides every file from seller's counsel", async () => {
    expect((await fetchAs(sellerCounsel, teamDocument)).status).toBe(404);
  });

  it('sends someone signed out to the counsel sign-in', async () => {
    const response = await fetchAs(null, teamDocument);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/counsel/sign-in');
  });

  it('records nothing for a refused request', async () => {
    expect(await tracked()).toHaveLength(2);
  });
});

describe('the team reading what counsel opened', () => {
  it('shows a deal manager who opened which file, newest first', async () => {
    expect(
      (await loadCounselActivity(owner.client, admin, dealId)).map((entry) => [
        entry.person,
        entry.action,
        entry.file,
      ]),
    ).toEqual([
      ['Bea Buyerlaw', 'document_previewed', 'returns.pdf'],
      ['Bea Buyerlaw', 'document_downloaded', 'returns.pdf'],
    ]);
  });

  it('shows a team member without deals.manage nothing', async () => {
    expect(await loadCounselActivity(member.client, admin, dealId)).toEqual([]);
  });
});

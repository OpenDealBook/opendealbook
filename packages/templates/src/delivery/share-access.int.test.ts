import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

import { respondToSellerShareRequest } from './share-access';

let owner: Person;
let recipient: Person;
let partner: Person;
let stranger: Person;
let teamId: string;
let roomId: string;
let shareId: string;
let pdfPath: string;

function request(headers: Record<string, string> = {}) {
  return new Request(
    `http://localhost:3000/seller/rooms/${roomId}/documents/${shareId}`,
    {
      headers,
    },
  );
}

async function share() {
  const { data } = await admin
    .from('document_share')
    .select('first_viewed_at')
    .eq('id', shareId)
    .single()
    .throwOnError();

  return data;
}

async function openings() {
  const { data } = await admin
    .from('seller_room_activity')
    .select('user_id, action, payload')
    .eq('room_id', roomId)
    .eq('action', 'document_previewed')
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  recipient = await provisionPerson();
  partner = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  const dealId = await newDeal(teamId, owner);

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  for (const [person, name] of [
    [recipient, 'Sam Seller'],
    [partner, 'Pat Partner'],
  ] as const) {
    await admin
      .from('seller_room_member')
      .insert({
        room_id: roomId,
        user_id: person.userId,
        email: person.email,
        name,
      })
      .throwOnError();
  }

  pdfPath = `${teamId}/${dealId}/${crypto.randomUUID()}.pdf`;
  await admin.storage.from('generated').upload(pdfPath, new Blob(['%PDF loi']));

  const { data: generated } = await admin
    .from('generated_document')
    .insert({ account_id: teamId, deal_id: dealId, pdf_path: pdfPath })
    .select('id')
    .single()
    .throwOnError();

  const { data: sent } = await admin
    .from('document_share')
    .insert({
      account_id: teamId,
      generated_document_id: generated.id,
      recipient_user_id: recipient.userId,
      room_id: roomId,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()
    .throwOnError();
  shareId = sent.id;
});

afterAll(async () => {
  await admin.storage.from('generated').remove([pdfPath]);
  await cleanUp([teamId]);
});

describe('documents sent into the room', () => {
  it('opens for a fellow seller without marking the recipient as having viewed it', async () => {
    const response = await respondToSellerShareRequest({
      client: partner.client,
      admin,
      request: request(),
      roomId,
      shareId,
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain(
      '/storage/v1/object/sign/generated/',
    );
    expect((await share()).first_viewed_at).toBeNull();
  });

  it('marks the share viewed when the recipient opens it, and records every opening', async () => {
    await respondToSellerShareRequest({
      client: recipient.client,
      admin,
      request: request(),
      roomId,
      shareId,
    });

    expect((await share()).first_viewed_at).not.toBeNull();
    expect(await openings()).toEqual([
      {
        user_id: partner.userId,
        action: 'document_previewed',
        payload: { share_id: shareId },
      },
      {
        user_id: recipient.userId,
        action: 'document_previewed',
        payload: { share_id: shareId },
      },
    ]);
  });

  it('answers 404 to someone who is not in the room', async () => {
    const response = await respondToSellerShareRequest({
      client: stranger.client,
      admin,
      request: request(),
      roomId,
      shareId,
    });

    expect(response.status).toBe(404);
  });

  it('sends a request from another site back to the room', async () => {
    const response = await respondToSellerShareRequest({
      client: recipient.client,
      admin,
      request: request({ 'sec-fetch-site': 'cross-site' }),
      roomId,
      shareId,
    });

    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/seller/rooms/${roomId}`,
    );
  });
});

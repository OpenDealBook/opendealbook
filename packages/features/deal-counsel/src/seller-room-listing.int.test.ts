import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const { admin, cleanUp, newDeal, provisionPerson, provisionTeam } =
  await import('@odb/seller-rooms/test-support/world.ts');
const { loadSellerRoomListing } =
  await import('@odb/seller-rooms/files/listing.ts');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let seller: Person;
let sellerCounsel: Person;
let buyerCounsel: Person;
let teamId: string;
let roomId: string;

async function folder(dealId: string, name: string) {
  const { data } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, parent_id: null, name })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function documentIn(dealId: string, folderId: string, name: string) {
  const id = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function counselOn(
  dealId: string,
  person: Person,
  side: 'buyer' | 'seller',
) {
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side,
      user_id: person.userId,
      email: person.email,
    })
    .throwOnError();
}

beforeAll(async () => {
  const owner = await provisionPerson();
  seller = await provisionPerson();
  sellerCounsel = await provisionPerson();
  buyerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  const dealId = await newDeal(teamId, owner);

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  const shared = await folder(dealId, 'Financials');
  const teamOnly = await folder(dealId, 'Internal');
  await documentIn(dealId, shared, 'p-and-l.pdf');
  await documentIn(dealId, teamOnly, 'notes.pdf');

  await admin
    .from('seller_room_folder')
    .insert({ room_id: roomId, dr_folder_id: shared })
    .throwOnError();
  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();
  await counselOn(dealId, sellerCounsel, 'seller');
  await counselOn(dealId, buyerCounsel, 'buyer');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('the seller room listing for counsel', () => {
  it("shows seller's counsel exactly what it shows the seller", async () => {
    const asSeller = await loadSellerRoomListing(seller.client, roomId);
    const asCounsel = await loadSellerRoomListing(sellerCounsel.client, roomId);

    expect(
      asSeller.master!.folders.flatMap((f) => f.entries.map((e) => e.name)),
    ).toEqual(['p-and-l.pdf']);
    expect(asCounsel).toEqual(asSeller);
  });

  it("does not list the seller room for buyer's counsel", async () => {
    await expect(
      loadSellerRoomListing(buyerCounsel.client, roomId),
    ).rejects.toThrow();
  });
});

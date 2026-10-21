import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedDocument,
  seedFolder,
  seedTeamDeal,
  seedRoom,
} from '../asks/integration-harness';
import { fetchDealFaq, listDealDocuments, searchDealFaq } from './team-queries';

let owner: Person;
let outsider: Person;
let deal: { accountId: string; dealId: string };
let roomId: string;
let privateFolderId: string;

async function createEntry(
  question: string,
  status: 'draft' | 'published' | 'unpublished',
  pinned = false,
) {
  const { data } = await admin
    .from('lender_faq_entry')
    .insert({
      account_id: deal.accountId,
      deal_id: deal.dealId,
      question,
      answer: `Answer to ${question}`,
      status: status === 'unpublished' ? 'published' : status,
      pinned,
    })
    .select('id')
    .single()
    .throwOnError();

  if (status === 'unpublished') {
    await admin
      .from('lender_faq_entry')
      .update({ status })
      .eq('id', data.id)
      .throwOnError();
  }

  return data.id;
}

beforeAll(async () => {
  [owner, outsider] = await Promise.all([provisionPerson(), provisionPerson()]);
  deal = await seedTeamDeal(owner);
  ({ roomId, privateFolderId } = await seedRoom(deal, 'First Bank', []));
});

afterAll(async () => {
  await admin
    .from('seller_room')
    .delete()
    .eq('deal_id', deal.dealId)
    .throwOnError();
  await admin
    .from('lender_faq_entry')
    .delete()
    .eq('deal_id', deal.dealId)
    .throwOnError();
  await removeEverythingSeeded();
});

describe('the deal team FAQ list', () => {
  it('lists every entry of the deal, pinned first then newest, with what the team manages', async () => {
    const oldest = await createEntry('Oldest', 'published');
    const pinned = await createEntry('Pinned', 'unpublished', true);
    const newest = await createEntry('Newest', 'draft');

    await admin
      .from('lender_faq_file')
      .insert({
        entry_id: oldest,
        deal_id: deal.dealId,
        name: 'Rent roll.pdf',
        storage_path: `deal/${deal.dealId}/faq-rent-roll.pdf`,
      })
      .throwOnError();
    await admin
      .from('lender_faq_hidden')
      .insert({ room_id: roomId, deal_id: deal.dealId, entry_id: oldest })
      .throwOnError();

    const entries = await fetchDealFaq(owner.client, deal.dealId);

    expect(entries.map((entry) => entry.id)).toEqual([pinned, newest, oldest]);
    expect(entries[0]).toMatchObject({
      question: 'Pinned',
      answer: 'Answer to Pinned',
      status: 'unpublished',
      pinned: true,
      version: 1,
      files: [],
      hiddenRoomIds: [],
    });
    expect(entries[1]).toMatchObject({ status: 'draft', pinned: false });
    expect(entries[2]).toMatchObject({
      status: 'published',
      files: [{ id: expect.any(String), name: 'Rent roll.pdf' }],
      hiddenRoomIds: [roomId],
    });
  });

  it('shows nothing to someone outside the deal', async () => {
    await createEntry('Private', 'published');

    expect(await fetchDealFaq(outsider.client, deal.dealId)).toEqual([]);
  });
});

describe('finding entries like a new question across the deal', () => {
  it('finds entries sharing any word of the question, whatever their status or room, most shared first', async () => {
    const draft = await createEntry(
      'Is the roof warranty transferable?',
      'draft',
    );
    const pulled = await createEntry('Roof age and condition', 'unpublished');
    const hidden = await createEntry(
      'When was the roof replaced?',
      'published',
    );
    await createEntry('What is the occupancy?', 'published');
    await admin
      .from('lender_faq_hidden')
      .insert({ room_id: roomId, deal_id: deal.dealId, entry_id: hidden })
      .throwOnError();

    const found = await searchDealFaq(
      owner.client,
      deal.dealId,
      'How old is the roof, and is its warranty transferable?',
    );

    expect(found[0]).toEqual({
      id: draft,
      question: 'Is the roof warranty transferable?',
    });
    expect(found.map((entry) => entry.id).sort()).toEqual(
      [draft, pulled, hidden].sort(),
    );
  });

  it('finds nothing for someone outside the deal', async () => {
    await createEntry('Seller financing terms', 'published');

    expect(
      await searchDealFaq(outsider.client, deal.dealId, 'seller financing'),
    ).toEqual([]);
  });
});

describe('the deal data room documents a FAQ entry can take', () => {
  it('offers team folders, never a lender room upload or a seller room upload', async () => {
    const team = await seedFolder(deal, 'Financials');
    const teamNested = await seedFolder(deal, 'Tax', team);
    const lenderNested = await seedFolder(deal, 'Their docs', privateFolderId);
    const sellerUploads = await seedFolder(deal, 'Seller uploads');
    await admin
      .from('seller_room')
      .insert({
        account_id: deal.accountId,
        deal_id: deal.dealId,
        uploads_folder_id: sellerUploads,
      })
      .throwOnError();
    const offered = await seedDocument(deal, team, 'Offered.pdf');
    const offeredNested = await seedDocument(deal, teamNested, 'Nested.pdf');
    const lenderUpload = await seedDocument(
      deal,
      privateFolderId,
      'Lender.pdf',
    );
    const lenderNestedUpload = await seedDocument(
      deal,
      lenderNested,
      'Deep.pdf',
    );
    const sellerUpload = await seedDocument(deal, sellerUploads, 'Seller.pdf');

    const ids = (await listDealDocuments(owner.client, deal.dealId)).map(
      (document) => document.id,
    );

    expect(ids).toEqual(expect.arrayContaining([offered, offeredNested]));
    for (const fenced of [lenderUpload, lenderNestedUpload, sellerUpload]) {
      expect(ids).not.toContain(fenced);
    }
  });

  it('leaves out documents removed from the data room', async () => {
    const folderId = await seedFolder(deal, 'Old');
    const removed = await seedDocument(deal, folderId, 'Removed.pdf');
    await admin
      .rpc('append_deal_event', {
        p_deal_id: deal.dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: removed,
        p_event_type: 'dr_document.removed',
        p_actor_kind: 'service',
      })
      .throwOnError();

    const documents = await listDealDocuments(owner.client, deal.dealId);

    expect(documents.map((document) => document.id)).not.toContain(removed);
  });

  it('lists the deal documents by name', async () => {
    const folderId = await seedFolder(deal, 'Diligence');
    const zebra = await seedDocument(deal, folderId, 'Zebra.pdf');
    const alpha = await seedDocument(deal, folderId, 'Alpha.pdf');

    const documents = await listDealDocuments(owner.client, deal.dealId);

    expect(
      documents.filter((document) => [zebra, alpha].includes(document.id)),
    ).toEqual([
      { id: alpha, name: 'Alpha.pdf' },
      { id: zebra, name: 'Zebra.pdf' },
    ]);
  });
});

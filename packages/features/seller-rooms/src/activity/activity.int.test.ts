import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';
import { loadSellerRoomActivity } from './queries';

type ActivityRow =
  Database['public']['Tables']['seller_room_activity']['Insert'];

let owner: Person;
let seller: Person;
let removedSeller: Person;
let stranger: Person;
let teamId: string;
let strangerTeamId: string;
let dealId: string;
let roomId: string;
let financials: string;
let pnl: string;
let lease: string;
let questionId: string;
let ownerName: string;

async function documentIn(folderId: string, name: string) {
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
        storage_path: `deal/${dealId}/${crypto.randomUUID()}`,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return id;
}

async function record(
  person: Person,
  minute: number,
  row: Omit<ActivityRow, 'room_id' | 'account_id' | 'user_id' | 'side'> & {
    side?: ActivityRow['side'];
  },
) {
  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: teamId,
      user_id: person.userId,
      side: 'seller',
      created_at: `2026-10-01T09:0${minute}:00Z`,
      ...row,
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  removedSeller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  strangerTeamId = await provisionTeam(stranger, 'Other Partners');
  dealId = await newDeal(teamId, owner);

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  const { data: ownerAccount } = await admin
    .from('accounts')
    .select('name')
    .eq('id', owner.userId)
    .single()
    .throwOnError();
  ownerName = ownerAccount.name;

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();
  await admin
    .from('seller_room_removed_member')
    .insert({
      room_id: roomId,
      user_id: removedSeller.userId,
      email: removedSeller.email,
      invited_at: '2026-09-01T00:00:00Z',
    })
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Financials' })
    .select('id')
    .single()
    .throwOnError();
  financials = folder.id;
  pnl = await documentIn(financials, 'p-and-l.pdf');
  lease = await documentIn(financials, 'lease.pdf');
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: lease,
      p_event_type: 'dr_document.removed',
      p_payload: {},
      p_actor_kind: 'service',
    })
    .throwOnError();

  const meetingId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'meeting',
      p_aggregate_id: meetingId,
      p_event_type: 'meeting.scheduled',
      p_payload: { type: 'weekly', scheduled_at: '2026-10-01T15:00:00Z' },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: question } = await admin
    .from('seller_room_question')
    .insert({ room_id: roomId, account_id: teamId, title: 'Customer list?' })
    .select('id')
    .single()
    .throwOnError();
  questionId = question.id;

  const { data: generated } = await admin
    .from('generated_document')
    .insert({ account_id: teamId, deal_id: dealId })
    .select('id')
    .single()
    .throwOnError();
  const { data: share } = await admin
    .from('document_share')
    .insert({
      account_id: teamId,
      generated_document_id: generated.id,
      recipient_user_id: seller.userId,
      room_id: roomId,
    })
    .select('id')
    .single()
    .throwOnError();

  await record(seller, 1, {
    action: 'folder_opened',
    dr_folder_id: financials,
  });
  await record(seller, 2, {
    action: 'document_previewed',
    dr_document_id: pnl,
  });
  await record(seller, 3, {
    action: 'document_downloaded',
    dr_document_id: lease,
  });
  await record(owner, 4, { action: 'room_opened', side: 'internal' });
  await record(seller, 5, {
    action: 'meeting_opened',
    payload: { meeting_id: meetingId },
  });
  await record(seller, 6, {
    action: 'question_answered',
    payload: { question_id: questionId },
  });
  await record(seller, 7, {
    action: 'zip_downloaded',
    payload: { document_ids: [pnl, lease] },
  });
  await record(seller, 8, {
    action: 'document_previewed',
    payload: { share_id: share.id },
  });
  await record(removedSeller, 9, { action: 'room_opened' });
});

afterAll(async () => {
  await cleanUp([teamId, strangerTeamId]);
});

describe('loadSellerRoomActivity', () => {
  it('lists every seller and teammate action newest first, naming who and what', async () => {
    const entries = await loadSellerRoomActivity(owner.client, admin, dealId);
    const sam = { name: 'Sam Seller', email: seller.email, isRemoved: false };

    expect(
      entries.map(({ action, side, person, item }) => ({
        action,
        side,
        person,
        item,
      })),
    ).toEqual([
      {
        action: 'room_opened',
        side: 'seller',
        person: { name: null, email: removedSeller.email, isRemoved: true },
        item: null,
      },
      {
        action: 'document_previewed',
        side: 'seller',
        person: sam,
        item: { kind: 'sent', name: 'Document.pdf' },
      },
      {
        action: 'zip_downloaded',
        side: 'seller',
        person: sam,
        item: { kind: 'zip', fileCount: 2 },
      },
      {
        action: 'question_answered',
        side: 'seller',
        person: sam,
        item: { kind: 'question', questionId, title: 'Customer list?' },
      },
      {
        action: 'meeting_opened',
        side: 'seller',
        person: sam,
        item: { kind: 'meeting', name: 'Weekly meeting, Oct 1, 2026' },
      },
      {
        action: 'room_opened',
        side: 'internal',
        person: { name: ownerName, email: owner.email, isRemoved: false },
        item: null,
      },
      {
        action: 'document_downloaded',
        side: 'seller',
        person: sam,
        item: {
          kind: 'file',
          documentId: lease,
          name: 'lease.pdf',
          isRemoved: true,
        },
      },
      {
        action: 'document_previewed',
        side: 'seller',
        person: sam,
        item: {
          kind: 'file',
          documentId: pnl,
          name: 'p-and-l.pdf',
          isRemoved: false,
        },
      },
      {
        action: 'folder_opened',
        side: 'seller',
        person: sam,
        item: { kind: 'folder', name: 'Financials' },
      },
    ]);
  });

  it('shows nothing to someone outside the team', async () => {
    expect(
      await loadSellerRoomActivity(stranger.client, admin, dealId),
    ).toEqual([]);
  });
});

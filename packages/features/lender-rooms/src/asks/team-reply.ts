import 'server-only';
import { nextVersion } from '@odb/data-room';
import { appendDealEvent } from '@odb/events';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal } from '../actions/refusal';
import { notifyRoomMembers } from './notify';
import { saveOurMove } from './room-checks';

export type TeamAsk = Pick<
  Tables<'lender_ask'>,
  'id' | 'room_id' | 'status' | 'first_response_at'
>;

export async function loadTeamAsk(askId: string): Promise<TeamAsk> {
  const client = getSupabaseServerClient();

  const { data: ask } = await client
    .from('lender_ask')
    .select('id, room_id, status, first_response_at, kind')
    .eq('id', askId)
    .maybeSingle()
    .throwOnError();

  const { data: worksOnDeal } = ask
    ? await client
        .rpc('can_work_lender_room', { room_id: ask.room_id })
        .throwOnError()
    : { data: false };

  if (!ask || !worksOnDeal) {
    throw new Refusal('Only the deal team can do that');
  }

  if (ask.kind !== 'ask') {
    throw new Refusal('That request was not found');
  }

  return ask;
}

export async function replyAsTeam(
  ask: TeamAsk,
  body: string | undefined,
  documentIds: string[],
): Promise<void> {
  const client = getSupabaseServerClient();

  if (body) {
    await client
      .from('lender_ask_message')
      .insert({ ask_id: ask.id, side: 'internal', body })
      .throwOnError();
  }

  await client
    .from('lender_ask_file')
    .insert(
      documentIds.map((documentId) => ({
        ask_id: ask.id,
        dr_document_id: documentId,
        role: 'fulfilment' as const,
      })),
    )
    .throwOnError();

  await saveOurMove(ask, 'reply');

  await notifyRoomMembers('lender_ask.answered', {
    roomId: ask.room_id,
    payload: { roomId: ask.room_id, askId: ask.id, kind: 'ask' },
  });
}

// Files from elsewhere in the deal reach the lender as copies in the lender
// room's own folder, sharing the stored object, so fulfilment stays inside
// what that room shows.
export async function forwardIntoAsk(input: {
  askId: string;
  body: string;
  sourceDocumentIds: string[];
}): Promise<void> {
  const client = getSupabaseServerClient();
  const ask = await loadTeamAsk(input.askId);

  const { data: room } = await client
    .from('lender_room')
    .select('deal_id, private_folder_id')
    .eq('id', ask.room_id)
    .single()
    .throwOnError();

  const { data: sources } = await client
    .from('dr_document')
    .select('id, deal_id, name, storage_path')
    .in('id', input.sourceDocumentIds)
    .throwOnError();

  const copies: string[] = [];

  for (const sourceId of input.sourceDocumentIds) {
    const source = sources.find((document) => document.id === sourceId);

    if (!source || source.deal_id !== room.deal_id) {
      throw new Refusal('That file is not in this deal');
    }

    const { data: sameNamed } = await client
      .from('dr_document')
      .select('version')
      .eq('folder_id', room.private_folder_id)
      .eq('name', source.name)
      .throwOnError();

    const copyId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: room.deal_id,
      aggregateType: 'dr_document',
      aggregateId: copyId,
      eventType: 'dr_document.added',
      payload: {
        folder_id: room.private_folder_id,
        name: source.name,
        storage_path: source.storage_path,
        version: nextVersion(sameNamed.map((document) => document.version)),
      },
    });

    copies.push(copyId);
  }

  await replyAsTeam(ask, input.body || undefined, copies);
}

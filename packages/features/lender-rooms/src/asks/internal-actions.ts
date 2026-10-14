'use server';

import { z } from 'zod';

import { nextVersion } from '@odb/data-room';
import { appendDealEvent } from '@odb/events';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { notifyRoomMembers } from './notify';
import { replySchemaFor } from './reply-schema';
import { assertInRoomFolder, loadFolderTree, saveOurMove } from './room-checks';

type LoadedAsk = Pick<
  Tables<'lender_ask'>,
  'id' | 'room_id' | 'status' | 'first_response_at'
>;

async function loadAsk(askId: string): Promise<LoadedAsk> {
  const client = getSupabaseServerClient();

  const { data: ask } = await client
    .from('lender_ask')
    .select('id, room_id, status, first_response_at, kind')
    .eq('id', askId)
    .maybeSingle()
    .throwOnError();

  const { data: isDealTeam } = ask
    ? await client
        .rpc('can_manage_lender_room', { room_id: ask.room_id })
        .throwOnError()
    : { data: false };

  if (!ask || !isDealTeam) {
    throw new Refusal('Only the deal team can do that');
  }

  if (ask.kind !== 'ask') {
    throw new Refusal('That request was not found');
  }

  return ask;
}

export const replyToAskAsInternal = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const documentIds = input.documentIds ?? [];
    const ask = await loadAsk(input.askId);

    await assertInRoomFolder(ask.room_id, documentIds);

    if (input.body) {
      await client
        .from('lender_ask_message')
        .insert({ ask_id: ask.id, side: 'internal', body: input.body })
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
  },
  { auth: true, schema: replySchemaFor('askId') },
);

const closeSchema = z.object({ askId: z.uuid() });

export const closeAskAsInternal = refusableAction(
  async (input) => {
    await saveOurMove(await loadAsk(input.askId), 'close');
  },
  { auth: true, schema: closeSchema },
);

const promoteSchema = z.object({
  askFileId: z.uuid(),
  folderId: z.uuid(),
});

export const promoteAskFile = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: file } = await client
      .from('lender_ask_file')
      .select('dr_document_id, ask:lender_ask!inner(kind)')
      .eq('id', input.askFileId)
      .eq('role', 'fulfilment')
      .eq('ask.kind', 'ask')
      .single()
      .throwOnError();

    const { data: document } = await client
      .from('dr_document')
      .select('deal_id, name, storage_path')
      .eq('id', file.dr_document_id)
      .single()
      .throwOnError();

    const { data: lenderPackage } = await client
      .from('lender_package')
      .select('master_folder_id')
      .eq('deal_id', document.deal_id)
      .single()
      .throwOnError();

    const folderTree = await loadFolderTree(document.deal_id);

    if (!folderTree.isWithin(input.folderId, lenderPackage.master_folder_id)) {
      throw new Refusal('That folder is not in the lender package');
    }

    const { data: sameNamedDocuments } = await client
      .from('dr_document')
      .select('version, storage_path')
      .eq('folder_id', input.folderId)
      .eq('name', document.name)
      .throwOnError();

    if (
      sameNamedDocuments.some(
        (sameNamed) => sameNamed.storage_path === document.storage_path,
      )
    ) {
      return;
    }

    await appendDealEvent(client, {
      dealId: document.deal_id,
      aggregateType: 'dr_document',
      aggregateId: crypto.randomUUID(),
      eventType: 'dr_document.added',
      payload: {
        folder_id: input.folderId,
        name: document.name,
        storage_path: document.storage_path,
        version: nextVersion(
          sameNamedDocuments.map((sameNamed) => sameNamed.version),
        ),
      },
    });
  },
  { auth: true, schema: promoteSchema },
);

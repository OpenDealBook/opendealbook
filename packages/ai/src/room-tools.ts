import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

import {
  documentTool,
  type DocumentReads,
  scopedToolSet,
  stringArg,
  ToolError,
} from './tools';

export interface RoomToolContext {
  client: SupabaseClient<Database>;
  roomId: string;
}

const FAQ_IS_NOT_A_SOURCE =
  'FAQ entries are already published to this room but are not documents and cannot be cited.';

const roomReads: DocumentReads<RoomToolContext> = {
  scope: 'lender room',
  citedDocument: async ({ client, roomId }, documentId) => {
    const { data: shown } = await client
      .rpc('lender_room_shows_document', {
        room_id: roomId,
        document_id: documentId,
      })
      .throwOnError();
    const { data } = shown
      ? await client
          .from('dr_document')
          .select('id, name, version')
          .eq('id', documentId)
          .maybeSingle()
          .throwOnError()
      : { data: null };
    if (!data) {
      throw new ToolError(`No document ${documentId} in this lender room.`);
    }
    return {
      documentId: data.id,
      documentName: data.name,
      version: data.version,
    };
  },
  searchSegments: async ({ client, roomId }, args) =>
    (
      await client
        .rpc('search_room_segments', { room_id: roomId, ...args })
        .throwOnError()
    ).data,
  readPages: async ({ client, roomId }, args) =>
    (
      await client
        .rpc('read_room_document_pages', { room_id: roomId, ...args })
        .throwOnError()
    ).data,
  listSheets: async ({ client, roomId }, documentId) =>
    (
      await client
        .rpc('list_room_sheets', { room_id: roomId, document_id: documentId })
        .throwOnError()
    ).data,
  readSheetRange: async ({ client, roomId }, args) =>
    (
      await client
        .rpc('read_room_sheet_range', { room_id: roomId, ...args })
        .throwOnError()
    ).data,
  listDocuments: async ({ client, roomId }) =>
    (
      await client
        .rpc('list_room_documents', { room_id: roomId })
        .throwOnError()
    ).data,
};

const searchFaq = documentTool({
  name: 'search_faq',
  description: `Search the FAQ published to this lender room. ${FAQ_IS_NOT_A_SOURCE}`,
  args: z.strictObject({
    query: stringArg('Words or phrases to search for.'),
  }),
  run: async ({ client, roomId }: RoomToolContext, args) => {
    const { data } = await client
      .rpc('lender_room_faq', { room_id: roomId, query: args.query })
      .limit(10)
      .throwOnError();
    if (data.length === 0) {
      return { content: 'No FAQ entries.', citations: [] };
    }
    const entries = data.map(
      (entry) => `Question: ${entry.question}\nAnswer: ${entry.answer}`,
    );
    return {
      content: [...entries, FAQ_IS_NOT_A_SOURCE].join('\n\n'),
      citations: [],
    };
  },
});

const roomToolSet = scopedToolSet(roomReads, searchFaq);

export const roomTools = roomToolSet.definitions;

export const runRoomTool = roomToolSet.run;

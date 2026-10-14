'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import type { RoomFolder } from './listing';
import { loadRoomListing } from './load-listing';

const roomHideSchema = z.object({
  roomId: z.uuid(),
  target: z.object({
    kind: z.enum(['folder', 'document']),
    id: z.uuid(),
  }),
});

type RoomHide = z.infer<typeof roomHideSchema>;

const hiddenIdColumn = {
  folder: 'dr_folder_id',
  document: 'dr_document_id',
} as const;

export const hideForRoom = refusableAction(
  async ({ roomId, target }) => {
    const client = getSupabaseServerClient();
    const {
      masterRootId,
      hideIds: [id],
    } = await authoriseAndResolveHideIds(client, { roomId, target });

    if (target.id === masterRootId) {
      throw new Refusal(
        'The whole lender package cannot be hidden; close the room instead',
      );
    }

    if (id === undefined) {
      throw new Refusal('Only master package items can be hidden');
    }

    await client
      .from('lender_room_hidden')
      .upsert(
        target.kind === 'folder'
          ? { room_id: roomId, dr_folder_id: id }
          : { room_id: roomId, dr_document_id: id },
        {
          onConflict: `room_id,${hiddenIdColumn[target.kind]}`,
          ignoreDuplicates: true,
        },
      )
      .throwOnError();
  },
  { auth: true, schema: roomHideSchema },
);

export const unhideForRoom = refusableAction(
  async ({ roomId, target }) => {
    const client = getSupabaseServerClient();
    const { hideIds } = await authoriseAndResolveHideIds(client, {
      roomId,
      target,
    });

    await client
      .from('lender_room_hidden')
      .delete()
      .eq('room_id', roomId)
      .in(hiddenIdColumn[target.kind], hideIds)
      .throwOnError();
  },
  { auth: true, schema: roomHideSchema },
);

async function authoriseAndResolveHideIds(
  client: SupabaseClient<Database>,
  { roomId, target }: RoomHide,
): Promise<{ masterRootId: string | undefined; hideIds: string[] }> {
  const { data: isDealTeam } = await client
    .rpc('can_manage_lender_room', { room_id: roomId })
    .throwOnError();

  if (!isDealTeam) {
    throw new Refusal('Only the deal team can hide or unhide room items');
  }

  const { master } = await loadRoomListing(client, { roomId, since: null });
  const folders = master ? withSubfolders(master) : [];

  const hideIds =
    target.kind === 'folder'
      ? folders
          .filter((folder) => folder.id === target.id)
          .map((folder) => folder.id)
      : (folders
          .flatMap((folder) => folder.entries)
          .flatMap((entry) =>
            entry.kind === 'file'
              ? [
                  [
                    ...entry.earlierVersions
                      .map((version) => version.documentId)
                      .toReversed(),
                    entry.documentId,
                  ],
                ]
              : [],
          )
          .find((versionIds) => versionIds.includes(target.id)) ?? []);

  return { masterRootId: master?.id, hideIds };
}

function withSubfolders(folder: RoomFolder): RoomFolder[] {
  return [folder, ...folder.folders.flatMap(withSubfolders)];
}

'use server';

import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { recordActivity, recordFolderActivity } from './record-activity';

export const recordRoomOpened = refusableAction(
  ({ roomId }) =>
    recordActivity({
      client: getSupabaseServerClient(),
      admin: getSupabaseServerAdminClient(),
      roomId,
      action: 'room_opened',
    }),
  { schema: z.object({ roomId: z.uuid() }) },
);

export const recordFolderOpened = refusableAction(
  ({ roomId, folderId }) =>
    recordFolderActivity({
      client: getSupabaseServerClient(),
      admin: getSupabaseServerAdminClient(),
      roomId,
      folderId,
    }),
  { schema: z.object({ roomId: z.uuid(), folderId: z.uuid() }) },
);

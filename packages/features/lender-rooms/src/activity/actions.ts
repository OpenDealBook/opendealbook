'use server';

import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { fetchRoomFaq } from '../faq/queries';
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

export const recordFaqPageOpened = refusableAction(
  ({ roomId }) =>
    recordActivity({
      client: getSupabaseServerClient(),
      admin: getSupabaseServerAdminClient(),
      roomId,
      action: 'faq_page_opened',
    }),
  { schema: z.object({ roomId: z.uuid() }) },
);

const faqEntrySchema = z.object({ roomId: z.uuid(), entryId: z.uuid() });

function recordFaqEntryAction(
  action: 'faq_entry_opened' | 'faq_suggestion_opened' | 'faq_suggestion_resolved',
) {
  return refusableAction(
    async ({ roomId, entryId }) => {
      const client = getSupabaseServerClient();
      const entries = await fetchRoomFaq(client, roomId);

      if (!entries.some((entry) => entry.id === entryId)) {
        throw new Refusal('This FAQ entry is no longer available');
      }

      await recordActivity({
        client,
        admin: getSupabaseServerAdminClient(),
        roomId,
        faqEntryId: entryId,
        action,
      });
    },
    { schema: faqEntrySchema },
  );
}

export const recordFaqEntryOpened = recordFaqEntryAction('faq_entry_opened');

export const recordFaqSuggestionOpened = recordFaqEntryAction(
  'faq_suggestion_opened',
);

export const recordFaqSuggestionResolved = recordFaqEntryAction(
  'faq_suggestion_resolved',
);

'use server';

import { z } from 'zod';

import { appendDealEvents } from '@odb/events';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { isWithinFolder, packageRoot } from './access';

const NOT_IN_PACKAGE = 'That file is not in the lender package';

export const removePackageFile = refusableAction(
  async (input): Promise<void> => {
    const root = await packageRoot(input.dealId);
    const admin = getSupabaseServerAdminClient();
    const document = await admin
      .from('dr_document')
      .select('folder_id, name')
      .eq('id', input.documentId)
      .eq('deal_id', input.dealId)
      .is('removed_at', null)
      .maybeSingle()
      .throwOnError();

    if (
      !document.data ||
      !(await isWithinFolder(
        input.dealId,
        document.data.folder_id,
        root.masterFolderId,
      ))
    ) {
      throw new Refusal(NOT_IN_PACKAGE);
    }

    const versions = await admin
      .from('dr_document')
      .select('id')
      .eq('folder_id', document.data.folder_id)
      .eq('name', document.data.name)
      .is('removed_at', null)
      .throwOnError();

    await appendDealEvents(
      admin,
      input.dealId,
      versions.data.map((version) => ({
        aggregateType: 'dr_document',
        aggregateId: version.id,
        eventType: 'dr_document.removed',
        actorKind: 'service',
        payload: {},
      })),
    );
  },
  { schema: z.object({ dealId: z.uuid(), documentId: z.uuid() }) },
);

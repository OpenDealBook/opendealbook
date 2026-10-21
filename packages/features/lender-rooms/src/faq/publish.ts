'use server';

import { z } from 'zod';

import { deterministicUuid } from '@odb/contracts/esign';
import { basename } from '@odb/data-room/storage';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { canAddToFaq } from './answered';
import { DEAL_TEAM_ONLY, entryText, faqFileKey } from './entry-rules';
import { notifyFaqEntryPublished } from './notify';
import { copyAnswerFile } from './storage-copy';

const NOT_ANSWERED = 'Only an answered request can be added to the FAQ';
const NOT_OUR_FILE = 'Only our answer files can be added to the FAQ';
const FORM = 'A form cannot be added to the FAQ';
const NOT_FOUND = 'That request was not found';

const newEntrySchema = z.object({
  entryId: z.uuid(),
  dealId: z.uuid(),
  askIds: z.array(z.uuid()),
  question: entryText,
  answer: entryText,
  status: z.enum(['draft', 'published']),
  files: z.array(z.object({ askFileId: z.uuid(), name: z.string() })),
});

type ChosenFile = z.infer<typeof newEntrySchema>['files'][number];

export const saveNewFaqEntry = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const accountId = await managedDealAccount(input.dealId);
    await refuseWhileTeamLocked(accountId);

    await assertAnsweredAsksOfDeal(input.dealId, input.askIds);
    const answerFiles = await chosenAnswerFiles(input.askIds, input.files);

    await client
      .from('lender_faq_entry')
      .upsert(
        {
          id: input.entryId,
          account_id: accountId,
          deal_id: input.dealId,
          question: input.question,
          answer: input.answer,
          status: 'draft',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      .throwOnError();

    await client
      .from('lender_faq_source')
      .upsert(
        input.askIds.map((askId) => ({
          entry_id: input.entryId,
          ask_id: askId,
        })),
        { onConflict: 'entry_id,ask_id', ignoreDuplicates: true },
      )
      .throwOnError();

    for (const file of answerFiles) {
      const fileId = deterministicUuid(
        `faq-answer:${input.entryId}:${file.askFileId}`,
      );
      const storagePath = faqFileKey(
        input.dealId,
        fileId,
        basename(file.document.storage_path),
      );

      await copyAnswerFile(
        getSupabaseServerAdminClient(),
        file.document,
        storagePath,
      );

      await getSupabaseServerAdminClient()
        .from('lender_faq_file')
        .upsert(
          {
            id: fileId,
            entry_id: input.entryId,
            deal_id: input.dealId,
            name: file.name,
            storage_path: storagePath,
            source_dr_document_id: file.document.id,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        )
        .throwOnError();
    }

    if (input.status === 'published') {
      await getSupabaseServerAdminClient()
        .from('lender_faq_entry')
        .update({ status: 'published' })
        .eq('id', input.entryId)
        .throwOnError();
      await notifyFaqEntryPublished(input.entryId);
    }
  },
  { auth: true, schema: newEntrySchema },
);

async function managedDealAccount(dealId: string): Promise<string> {
  const { data: deal } = await getSupabaseServerAdminClient()
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  const { data: managesDeal } = await getSupabaseServerClient()
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.account_id,
    })
    .throwOnError();

  if (!managesDeal) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  return deal.account_id;
}

async function assertAnsweredAsksOfDeal(dealId: string, askIds: string[]) {
  const { data: asks } = await getSupabaseServerClient()
    .from('lender_ask')
    .select(
      'kind, status, room:lender_room!inner(deal_id), messages:lender_ask_message(side)',
    )
    .in('id', askIds)
    .throwOnError();

  if (
    asks.length !== askIds.length ||
    asks.some((ask) => ask.room.deal_id !== dealId)
  ) {
    throw new Refusal(NOT_FOUND);
  }

  if (asks.some((ask) => ask.kind === 'form')) {
    throw new Refusal(FORM);
  }

  if (!asks.every(canAddToFaq)) {
    throw new Refusal(NOT_ANSWERED);
  }
}

async function chosenAnswerFiles(askIds: string[], chosen: ChosenFile[]) {
  const client = getSupabaseServerClient();

  const { data: askFiles } = await client
    .from('lender_ask_file')
    .select('id, dr_document_id')
    .in(
      'id',
      chosen.map((file) => file.askFileId),
    )
    .in('ask_id', askIds)
    .eq('role', 'fulfilment')
    .throwOnError();

  if (askFiles.length !== chosen.length) {
    throw new Refusal(NOT_OUR_FILE);
  }

  const { data: documents } = await client
    .from('dr_document')
    .select('id, name, storage_path')
    .in(
      'id',
      askFiles.map((file) => file.dr_document_id),
    )
    .throwOnError();

  return chosen.map((file) => {
    const askFile = askFiles.find(({ id }) => id === file.askFileId)!;

    return {
      ...file,
      document: documents.find(({ id }) => id === askFile.dr_document_id)!,
    };
  });
}

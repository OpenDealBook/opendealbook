import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { getAsk } from '../asks/queries';

const PARAGRAPH_BREAK = '\n\n';

export async function prefillFaqEntry(
  client: SupabaseClient<Database>,
  askId: string,
) {
  const ask = await getAsk(client, askId);
  const answerFiles = ask.files.filter((file) => file.role === 'fulfilment');

  const { data: documents } = await client
    .from('dr_document')
    .select('id, name')
    .in(
      'id',
      answerFiles.map((file) => file.dr_document_id),
    )
    .throwOnError();

  return {
    question: [ask.title, ask.body].filter(Boolean).join(PARAGRAPH_BREAK),
    answer: ask.messages
      .filter((message) => message.side === 'internal')
      .map((message) => message.body)
      .join(PARAGRAPH_BREAK),
    files: answerFiles.map((file) => ({
      askFileId: file.id,
      name: documents.find((document) => document.id === file.dr_document_id)!
        .name,
    })),
  };
}

import { notFound } from 'next/navigation';

import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { RoomLegacyQuestions } from '../../../seller/(delivery)/rooms/[roomId]/room-legacy-questions';
import { SellerQuestions } from './seller-questions';

export default async function CounselQuestionsPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  if (!(await enterCounselPortal(dealId)).includes('buyer')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const [
    { data: questions },
    { data: messages },
    { data: files },
    { data: legacy },
  ] = await Promise.all([
    client
      .rpc('buyer_counsel_seller_questions', { deal_id: dealId })
      .throwOnError(),
    client
      .rpc('buyer_counsel_seller_question_messages', { deal_id: dealId })
      .throwOnError(),
    client
      .rpc('buyer_counsel_seller_question_files', { deal_id: dealId })
      .throwOnError(),
    client
      .rpc('buyer_counsel_legacy_seller_questions', { deal_id: dealId })
      .throwOnError(),
  ]);

  const messagesOf = Map.groupBy(messages, (message) => message.question_id);
  const filesOf = Map.groupBy(files, (file) => file.question_id);

  return (
    <main className={'flex flex-col gap-6'}>
      <h2 className={'font-serif text-2xl font-medium'}>Seller questions</h2>
      <SellerQuestions
        dealId={dealId}
        questions={questions.map((question) => ({
          ...question,
          messages: messagesOf.get(question.id) ?? [],
          files: (filesOf.get(question.id) ?? []).map((file) => ({
            documentId: file.dr_document_id,
            name: file.name,
          })),
        }))}
      />
      <RoomLegacyQuestions questions={legacy} />
    </main>
  );
}

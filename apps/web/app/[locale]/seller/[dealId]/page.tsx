import { notFound, redirect } from 'next/navigation';

import { isLoiSigned, listSellerQuestions } from '@odb/diligence/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { SellerAnswerForm } from './seller-answer-form';

export const dynamic = 'force-dynamic';

export default async function SellerPortalPage(props: {
  params: Promise<{ locale: string; dealId: string }>;
}) {
  const { dealId } = await props.params;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: participant } = await client
    .from('deal_participant')
    .select('id')
    .eq('deal_id', dealId)
    .eq('user_id', user.id)
    .eq('party', 'seller')
    .maybeSingle();

  if (!participant) {
    notFound();
  }

  const { data: deal } = await client
    .from('deal')
    .select('id, description, stage')
    .eq('id', dealId)
    .maybeSingle();

  if (!deal) {
    notFound();
  }

  const [questions, loiSigned] = await Promise.all([
    listSellerQuestions(client, dealId),
    isLoiSigned(client, dealId),
  ]);

  const openQuestions = (questions ?? []).filter(
    (question) => question.answer === null,
  );

  const title = (deal.description ?? 'Untitled deal').replace(/^Example:\s*/, '');

  return (
    <main className={'mx-auto flex w-full max-w-2xl flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle className={'flex flex-wrap items-center gap-2 text-xl'}>
            {title}
            <Badge variant={'outline'}>{deal.stage}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={'text-muted-foreground text-sm'}>
            You are answering questions from the buyer for this deal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open questions</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-6'}>
          {openQuestions.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No open questions right now
            </p>
          ) : (
            openQuestions.map((question) => (
              <div key={question.id} className={'flex flex-col gap-2'}>
                <span className={'text-sm'}>{question.question}</span>
                <SellerAnswerForm questionId={question.id} loiSigned={loiSigned} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

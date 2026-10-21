import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { openSellerDocument } from '@odb/templates/delivery';

export default async function SellerDocumentPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const decision = await openSellerDocument(
    getSupabaseServerClient(),
    getSupabaseServerAdminClient(),
    shareId,
  );

  if (decision.kind === 'sign-in') {
    redirect(decision.path);
  }

  if (decision.kind === 'room') {
    redirect(decision.path);
  }

  if (decision.kind === 'not-found') {
    notFound();
  }

  return (
    <main className={'flex flex-col gap-4'}>
      <a
        href={decision.pdfUrl}
        className={'font-medium underline'}
        target={'_blank'}
        rel={'noreferrer'}
      >
        Open the PDF
      </a>
      <iframe
        title={'Document'}
        src={decision.pdfUrl}
        className={'h-[80vh] w-full rounded-md border'}
      />
    </main>
  );
}

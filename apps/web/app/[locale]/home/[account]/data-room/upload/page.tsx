import { getSupabaseServerClient } from '@odb/supabase/server';

import { BulkUploader } from './_components/bulk-uploader';

interface UploadPageProps {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<{ deal?: string }>;
}

export default async function DataRoomUploadPage({
  searchParams,
}: UploadPageProps) {
  const { deal } = await searchParams;

  if (!deal) {
    return (
      <main className={'flex flex-col gap-6 p-8'}>
        <h1 className={'text-2xl font-semibold'}>Upload documents</h1>
        <p className={'text-muted-foreground'}>
          Choose a deal to upload into by adding a deal to the address, for
          example ?deal=DEAL_ID.
        </p>
      </main>
    );
  }

  const client = getSupabaseServerClient();

  const { data: folders } = await client
    .from('dr_folder')
    .select('id, name')
    .eq('deal_id', deal)
    .order('name', { ascending: true });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Upload documents</h1>
      <BulkUploader dealId={deal} folders={folders ?? []} />
    </main>
  );
}

import { redirect } from 'next/navigation';

interface UploadPageProps {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<{ deal?: string }>;
}

export default async function DataRoomUploadPage({
  params,
  searchParams,
}: UploadPageProps) {
  const [{ account }, { deal }] = await Promise.all([params, searchParams]);

  redirect(deal ? `/home/${account}/deals/${deal}` : `/home/${account}/deals`);
}

import { permanentRedirect } from 'next/navigation';

export default async function TeamDealClosePage({
  params,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
}) {
  const { account, id } = await params;

  permanentRedirect(`/home/${account}/deals/${id}/customer-transition`);
}

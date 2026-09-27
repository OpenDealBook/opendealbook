import { AdminAccountDetail } from '@tuckin/admin';

export default async function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;

  return <AdminAccountDetail accountId={id} />;
}

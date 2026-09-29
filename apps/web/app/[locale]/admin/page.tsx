'use client';

import { useParams, useRouter } from 'next/navigation';

import { AdminAccountsTable } from '@odb/admin';

export default function AdminPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  return (
    <AdminAccountsTable
      onSelectAccount={(accountId) =>
        router.push(`/${locale}/admin/accounts/${accountId}`)
      }
    />
  );
}

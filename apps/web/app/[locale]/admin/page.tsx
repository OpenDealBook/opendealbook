'use client';

import { useRouter } from 'next/navigation';

import { AdminAccountsTable } from '@odb/admin';

export default function AdminPage() {
  const router = useRouter();

  return (
    <AdminAccountsTable
      onSelectAccount={(accountId) =>
        router.push(`/admin/accounts/${accountId}`)
      }
    />
  );
}

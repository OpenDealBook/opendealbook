import { fetchEmployees, fetchHrAuditEngagement } from '@odb/hr-audit/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../../layout';
import { HrAuditManager } from './_components/hr-audit-manager';

interface DealHrAuditPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function DealHrAuditPage({
  params,
}: DealHrAuditPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();

  const [engagement, employees] = await Promise.all([
    fetchHrAuditEngagement(client, id),
    fetchEmployees(client, id),
  ]);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>HR audit</h1>
      <HrAuditManager
        dealId={id}
        accountId={team.id}
        engagement={engagement}
        employees={employees}
      />
    </main>
  );
}

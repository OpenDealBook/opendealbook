import { fetchEmployees, fetchHrAuditEngagement } from '@odb/hr-audit/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { PageHeader } from '@odb/ui/page-header';

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
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <PageHeader level={2} title={'HR audit'} />
      <HrAuditManager
        dealId={id}
        accountId={team.id}
        engagement={engagement}
        employees={employees}
      />
    </main>
  );
}

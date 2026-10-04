import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { listWorkbookTemplates, listWorkbooks } from '@odb/workbooks';

import { loadTeamWorkspace } from '../../../layout';
import { DealWorkbooks } from './workbooks-manager';

interface DealWorkbooksPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function DealWorkbooksPage({
  params,
}: DealWorkbooksPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const deal = await client
    .from('deal')
    .select('id')
    .eq('id', id)
    .eq('account_id', team.id)
    .maybeSingle();

  if (!deal.data) {
    notFound();
  }

  const [workbooks, templates] = await Promise.all([
    listWorkbooks(team.id, client),
    listWorkbookTemplates(team.id, client),
  ]);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Workbooks</h1>
      <DealWorkbooks
        accountId={team.id}
        workbooks={workbooks.map((workbook) => ({
          id: workbook.id,
          templateId: workbook.template_id,
          status: workbook.status,
          subject:
            typeof (workbook.config_json as { subject?: unknown })?.subject ===
            'string'
              ? (workbook.config_json as { subject: string }).subject
              : null,
        }))}
        templates={templates}
      />
    </main>
  );
}

import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../layout';
import { ChecklistEditor } from './_components/checklist-editor';

interface ChecklistsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function ChecklistsPage({ params }: ChecklistsPageProps) {
  const { account } = await params;
  const { team, permissions } = await loadTeamWorkspace(account);

  const { data: templates } = await getSupabaseServerClient()
    .from('checklist_template')
    .select(
      'id, name, kind, is_default, items:checklist_template_item(id, title, category, due_offset_days, review_offset_days, owner_role, importance)',
    )
    .eq('account_id', team.id)
    .order('created_at')
    .order('sort_order', { referencedTable: 'checklist_template_item' })
    .throwOnError();

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Checklist templates</h1>
      <ChecklistEditor
        accountId={team.id}
        canManage={permissions.includes('checklists.manage')}
        templates={templates}
      />
    </main>
  );
}

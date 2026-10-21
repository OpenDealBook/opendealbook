import { loadOutreachTemplate } from '@odb/lender-outreach/template.ts';
import { fetchQuietDays } from '@odb/lender-rooms/crm/nudges/nudges.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { GatedControl } from '../../../_components/gated-control';
import {
  OutreachTemplateForm,
  QuietDaysForm,
} from '../../../_components/lender-crm/lender-settings';
import { loadTeamWorkspace } from '../../layout';

export default async function LenderSettingsPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team, permissions } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const [quietDays, template] = await Promise.all([
    fetchQuietDays(client, team.id),
    loadOutreachTemplate(client, team.id),
  ]);

  return (
    <main className={'flex max-w-3xl flex-col gap-10 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Lender settings</h1>
      <GatedControl
        allowed={permissions.includes('deals.manage')}
        reason={'Only deal managers can change lender settings.'}
      >
        <div className={'flex flex-col gap-10'}>
          <section className={'flex flex-col gap-3'}>
            <h2 className={'text-lg font-medium'}>Nudges</h2>
            <QuietDaysForm accountId={team.id} quietDays={quietDays} />
          </section>
          <section className={'flex flex-col gap-3'}>
            <h2 className={'text-lg font-medium'}>Outreach email</h2>
            <OutreachTemplateForm accountId={team.id} template={template} />
          </section>
        </div>
      </GatedControl>
    </main>
  );
}

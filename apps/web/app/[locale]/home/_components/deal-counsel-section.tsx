import { loadCounselActivity } from '@odb/deal-counsel/documents.ts';
import { managersOnlyRefusal } from '@odb/seller-rooms/members/people.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { CounselActivityTable } from './counsel-activity-table';
import { CounselInviteForm } from './counsel-invite-form';

export async function DealCounselSection({ dealId }: { dealId: string }) {
  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();
  const [activity, inviteRefusal] = await Promise.all([
    loadCounselActivity(client, admin, dealId),
    managersOnlyRefusal(client, admin, dealId, 'invite counsel'),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Counsel</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <CounselInviteForm dealId={dealId} blockedReason={inviteRefusal} />
        <section className={'flex flex-col gap-2'}>
          <h3 className={'font-medium'}>{"What buyer's counsel opened"}</h3>
          <CounselActivityTable entries={activity} />
        </section>
      </CardContent>
    </Card>
  );
}

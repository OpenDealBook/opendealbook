import {
  exportBuyerProfilePdf,
  loadBuyerProfile,
} from '@odb/buyer-profile/server';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../../layout';

interface RouteContext {
  params: Promise<{ locale: string; account: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { account } = await params;
  const { team, user } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const profile = await loadBuyerProfile(client, team.id);

  if (!profile || profile.display_name === null) {
    return new Response('No buyer profile', { status: 404 });
  }

  const { data: canManage } = await client.rpc('has_permission', {
    account_id: team.id,
    permission_name: 'buyer_profile.manage',
    user_id: user.id,
  });

  const pdf = await exportBuyerProfilePdf(profile, {
    includeSensitive: canManage === true,
  });

  return new Response(pdf as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="buyer-profile.pdf"',
    },
  });
}

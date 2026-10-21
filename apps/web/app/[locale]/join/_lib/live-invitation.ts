import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export interface LiveInvitation {
  teamName: string;
  inviterName: string;
}

export async function liveInvitation(
  token: string,
): Promise<LiveInvitation | null> {
  const admin = getSupabaseServerAdminClient();

  const { data: invitation } = await admin
    .from('invitations')
    .select('invited_by, accounts(name)')
    .eq('invite_token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
    .throwOnError();

  if (!invitation) {
    return null;
  }

  const { data: inviter } = await admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', invitation.invited_by)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return { teamName: invitation.accounts.name, inviterName: inviter.name };
}

export async function isLiveInvitation(token: string): Promise<boolean> {
  const { data } = await getSupabaseServerAdminClient()
    .from('invitations')
    .select('id')
    .eq('invite_token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
    .throwOnError();

  return data !== null;
}

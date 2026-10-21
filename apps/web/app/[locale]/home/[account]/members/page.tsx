import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import {
  InvitationsList,
  InviteMemberForm,
  MembersTable,
} from '@odb/team-accounts';

import { loadTeamWorkspace } from '../layout';

interface TeamMembersPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamMembersPage({
  params,
}: TeamMembersPageProps) {
  const { account } = await params;
  const { team, actorRole, permissions, isOwner } =
    await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();

  const { data: roleRows } = await client
    .from('roles')
    .select('name, hierarchy_level')
    .order('hierarchy_level');

  const { data: memberRows } = await client
    .from('accounts_memberships')
    .select('user_id, account_role, created_at')
    .eq('account_id', team.id)
    .throwOnError();

  // Service role: teammates cannot read each other's personal accounts, and
  // these ids come from memberships the caller was already allowed to read.
  const { data: people } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('primary_owner_user_id, name, email')
    .eq('is_personal_account', true)
    .in(
      'primary_owner_user_id',
      memberRows.map((row) => row.user_id),
    )
    .throwOnError();

  const roleLevels = new Map(
    (roleRows ?? []).map((row) => [row.name, row.hierarchy_level]),
  );
  const personFor = new Map(
    people.map((person) => [person.primary_owner_user_id, person]),
  );

  const members = memberRows.map((row) => ({
    userId: row.user_id,
    name: personFor.get(row.user_id)!.name,
    email: personFor.get(row.user_id)!.email,
    role: row.account_role,
    roleHierarchyLevel: roleLevels.get(row.account_role) ?? 0,
    createdAt: row.created_at,
  }));

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Members</h1>
      <MembersTable
        accountId={team.id}
        members={members}
        actorRole={actorRole}
        permissions={permissions}
        isOwner={isOwner}
      />
      <InviteMemberForm
        slug={account}
        accountId={team.id}
        permissions={permissions}
      />
      <section className={'flex flex-col gap-4'}>
        <h2 className={'text-lg font-semibold'}>Invitations</h2>
        <InvitationsList accountId={team.id} permissions={permissions} />
      </section>
    </main>
  );
}

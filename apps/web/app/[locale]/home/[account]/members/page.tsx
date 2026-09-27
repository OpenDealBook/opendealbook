import type { Role } from '@tuckin/policies';
import { getSupabaseServerClient } from '@tuckin/supabase/server';
import {
  InvitationsList,
  InviteMemberForm,
  MembersTable,
  type TeamMember,
} from '@tuckin/team-accounts';

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

  const roles: Role[] = (roleRows ?? []).map((row) => ({
    name: row.name,
    hierarchyLevel: row.hierarchy_level,
  }));

  const { data: memberRows } = await client
    .from('accounts_memberships')
    .select('user_id, account_role, created_at')
    .eq('account_id', team.id);

  const roleLevels = new Map(
    roles.map((role) => [role.name, role.hierarchyLevel]),
  );

  const members: TeamMember[] = (memberRows ?? []).map((row) => ({
    userId: row.user_id,
    role: row.account_role,
    roleHierarchyLevel: roleLevels.get(row.account_role) ?? 0,
    createdAt: row.created_at,
  }));

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <MembersTable
        accountId={team.id}
        members={members}
        actorRole={actorRole}
        permissions={permissions}
        roles={roles}
        isOwner={isOwner}
      />
      <InviteMemberForm
        slug={account}
        roles={roles}
        permissions={permissions}
      />
      <InvitationsList accountId={team.id} />
    </main>
  );
}

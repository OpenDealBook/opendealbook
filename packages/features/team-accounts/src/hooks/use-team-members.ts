'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';

import type { TeamMember } from '../lib/types';

export function teamMembersQueryKey(accountId: string) {
  return ['team-accounts', 'members', accountId];
}

export function useTeamMembers(accountId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: teamMembersQueryKey(accountId),
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await client
        .from('accounts_memberships')
        .select('user_id, account_role, created_at, roles(hierarchy_level)')
        .eq('account_id', accountId);

      if (error) {
        throw error;
      }

      return data.map((row) => ({
        userId: row.user_id,
        role: row.account_role,
        roleHierarchyLevel: row.roles.hierarchy_level,
        createdAt: row.created_at,
      }));
    },
  });
}

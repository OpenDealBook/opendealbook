'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import type { TeamInvitation } from '../lib/types';

export function teamInvitationsQueryKey(accountId: string) {
  return ['team-accounts', 'invitations', accountId];
}

export function useTeamInvitations(accountId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: teamInvitationsQueryKey(accountId),
    queryFn: async (): Promise<TeamInvitation[]> => {
      const { data, error } = await client
        .from('invitations')
        .select('id, email, role, expires_at, created_at')
        .eq('account_id', accountId);

      if (error) {
        throw error;
      }

      return data.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }));
    },
  });
}

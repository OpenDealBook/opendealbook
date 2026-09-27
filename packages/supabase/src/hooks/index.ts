'use client';

import { useQuery } from '@tanstack/react-query';

import { getSupabaseBrowserClient } from '../client';

export function useSupabase() {
  return getSupabaseBrowserClient();
}

export function useUser() {
  const client = useSupabase();

  return useQuery({
    queryKey: ['supabase', 'user'],
    queryFn: async () => {
      const { data, error } = await client.auth.getUser();

      if (error) {
        throw error;
      }

      return data.user;
    },
  });
}

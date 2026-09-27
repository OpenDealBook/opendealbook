'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import { dealKeys, fetchFirms } from '../shared';

export function useFirms(accountId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.firms(accountId),
    queryFn: () => fetchFirms(client, accountId),
    enabled: !!accountId,
  });
}

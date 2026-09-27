'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import { dealKeys, fetchDealBox } from '../shared';

export function useDealBox(accountId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.dealBox(accountId),
    queryFn: () => fetchDealBox(client, accountId),
    enabled: !!accountId,
  });
}

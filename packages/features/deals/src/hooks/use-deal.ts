'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import { dealKeys, fetchDeal } from '../shared';

export function useDeal(dealId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.deal(dealId),
    queryFn: () => fetchDeal(client, dealId),
    enabled: !!dealId,
  });
}

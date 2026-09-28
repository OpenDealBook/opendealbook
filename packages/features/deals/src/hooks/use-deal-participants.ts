'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';

import { dealKeys, fetchDealParticipants } from '../shared';

export function useDealParticipants(dealId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.dealParticipants(dealId),
    queryFn: () => fetchDealParticipants(client, dealId),
    enabled: !!dealId,
  });
}

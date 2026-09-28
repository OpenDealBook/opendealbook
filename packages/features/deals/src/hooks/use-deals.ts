'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';

import { dealKeys, fetchDeals } from '../shared';
import type { DealFilters } from '../shared';

export function useDeals(accountId: string, filters?: DealFilters) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.deals(accountId, filters),
    queryFn: () => fetchDeals(client, accountId, filters),
    enabled: !!accountId,
  });
}

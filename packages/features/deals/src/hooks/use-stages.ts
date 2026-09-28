'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';

import { dealKeys, fetchAccountStages } from '../shared';

export function useStages(accountId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.stages(accountId),
    queryFn: () => fetchAccountStages(client, accountId),
    enabled: !!accountId,
  });
}

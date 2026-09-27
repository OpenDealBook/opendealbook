'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import { dealKeys, fetchChecklistItems } from '../shared';

export function useChecklistItems(dealId: string) {
  const client = useSupabase();

  return useQuery({
    queryKey: dealKeys.checklistItems(dealId),
    queryFn: () => fetchChecklistItems(client, dealId),
    enabled: !!dealId,
  });
}

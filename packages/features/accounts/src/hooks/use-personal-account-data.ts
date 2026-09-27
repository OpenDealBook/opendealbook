'use client';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import { accountKeys, fetchPersonalAccount } from '../shared';
import type { PersonalAccountData } from '../shared';

export function usePersonalAccountData(
  userId: string,
  initialData?: PersonalAccountData,
) {
  const client = useSupabase();

  return useQuery({
    queryKey: accountKeys.data(userId),
    queryFn: () => fetchPersonalAccount(client, userId),
    enabled: !!userId,
    refetchOnWindowFocus: false,
    initialData,
  });
}

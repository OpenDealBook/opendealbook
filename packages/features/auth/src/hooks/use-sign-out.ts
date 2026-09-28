'use client';

import { useCallback } from 'react';

import { useSupabase } from '@odb/supabase/hooks';

export function useSignOut() {
  const client = useSupabase();

  return useCallback(() => client.auth.signOut(), [client]);
}

'use client';

import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { accountKeys } from '../shared';

export function useRevalidatePersonalAccountData() {
  const queryClient = useQueryClient();

  return useCallback(
    (userId: string) =>
      queryClient.invalidateQueries({ queryKey: accountKeys.data(userId) }),
    [queryClient],
  );
}

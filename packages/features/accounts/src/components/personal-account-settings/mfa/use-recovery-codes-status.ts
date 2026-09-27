'use client';

import { useQuery } from '@tanstack/react-query';

import { recoveryCodesStatusAction } from '../../../server/mfa-recovery-server-actions';

export function useRecoveryCodesStatus() {
  return useQuery({
    queryKey: ['mfa', 'recovery-codes', 'status'],
    queryFn: () => recoveryCodesStatusAction(),
  });
}

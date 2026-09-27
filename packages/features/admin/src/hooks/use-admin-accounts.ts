'use client';

import { useQuery } from '@tanstack/react-query';

import {
  getAccountDetailAction,
  listAccountsAction,
} from '../lib/server/admin-actions';
import type { ListAccountsInput } from '../lib/server/schemas';

export function useAdminAccounts(input: ListAccountsInput) {
  return useQuery({
    queryKey: ['admin', 'accounts', input],
    queryFn: () => listAccountsAction(input),
  });
}

export function useAdminAccount(accountId: string) {
  return useQuery({
    queryKey: ['admin', 'account', accountId],
    queryFn: () => getAccountDetailAction({ accountId }),
  });
}

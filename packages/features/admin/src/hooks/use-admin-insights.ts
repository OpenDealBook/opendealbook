'use client';

import { useQuery } from '@tanstack/react-query';

import {
  getAdminCompsPoolAction,
  getAdminOverviewAction,
} from '../lib/server/admin-insights';

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminOverviewAction(),
  });
}

export function useAdminCompsPool() {
  return useQuery({
    queryKey: ['admin', 'comps-pool'],
    queryFn: () => getAdminCompsPoolAction(),
  });
}

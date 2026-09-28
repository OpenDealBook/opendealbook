'use client';

import { useChecklistItems } from '@tuckin/deals/hooks';

import { dealBlockers, sortByRisk } from './ranking';

export function useDealChecklist(dealId: string) {
  const query = useChecklistItems(dealId);
  const items = query.data ?? [];

  return {
    ...query,
    items: sortByRisk(items),
    blockers: dealBlockers(items),
  };
}

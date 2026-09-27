import type { Enums } from '@tuckin/supabase';

export interface DealFilters {
  stage?: string;
  source?: Enums<'deal_source'>;
  firm_id?: string;
}

export const dealKeys = {
  deals: (accountId: string, filters?: DealFilters) =>
    ['deals', accountId, filters ?? null] as const,
  stages: (accountId: string) => ['pipeline-stages', accountId] as const,
  deal: (dealId: string) => ['deal', dealId] as const,
  firms: (accountId: string) => ['firms', accountId] as const,
  dealBox: (accountId: string) => ['deal-box', accountId] as const,
  checklistItems: (dealId: string) => ['checklist-items', dealId] as const,
  dealParticipants: (dealId: string) => ['deal-participants', dealId] as const,
};

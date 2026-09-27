import { defineQuery, defineSignal } from '@temporalio/workflow';

import type { Json } from '@tuckin/supabase';

export type DealStage =
  | 'loi'
  | 'data_room'
  | 'meetings'
  | 'announcement'
  | 'closed';

export const advanceStage = defineSignal<[DealStage]>('advanceStage');
export const sellerUploaded = defineSignal<[Json]>('sellerUploaded');
export const counselAcceptedTurn = defineSignal<[Json]>('counselAcceptedTurn');
export const currentStage = defineQuery<DealStage>('currentStage');

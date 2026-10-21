import type { Enums } from '@odb/supabase';

export const TIMELINE_ANSWERS: Record<
  Enums<'lender_timeline_answer'>,
  string
> = {
  yes: 'Yes',
  no: 'No',
  need_to_talk: 'Need to talk',
};

'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { timelineAnswerSchema } from './answer-schema';

export const recordTimelineAnswer = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: isDealTeam } = await client
      .rpc('can_manage_lender_room', { room_id: input.roomId })
      .throwOnError();

    if (!isDealTeam) {
      throw new Refusal('Only the deal team can do that');
    }

    const { data: room } = await client
      .from('lender_room')
      .select('account_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    await refuseWhileTeamLocked(room.account_id);

    await client
      .from('lender_room_timeline_answer')
      .upsert({
        room_id: input.roomId,
        answer: input.answer,
        answered_at: new Date().toISOString(),
        answered_by: user.id,
        source: 'internal',
        note: null,
        earliest_close_date: null,
      })
      .throwOnError();
  },
  { auth: true, schema: timelineAnswerSchema },
);

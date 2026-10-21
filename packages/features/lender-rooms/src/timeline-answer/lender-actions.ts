'use server';

import { z } from 'zod';

import { teamItemPath } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { refusableAction } from '../actions/refusable-action';
import { notifyOurTeam, ourTeamIds } from '../asks/notify';
import { assertRoomMember } from '../asks/room-checks';
import { longDate } from '../browser/header-facts';
import { lenderTimelineAnswerSchema } from './answer-schema';

export const answerTimeline = refusableAction(
  async (input, user) => {
    await assertRoomMember(input.roomId);

    const admin = getSupabaseServerAdminClient();

    const { data: stored } = await admin
      .from('lender_room_timeline_answer')
      .select('answer, note, earliest_close_date')
      .eq('room_id', input.roomId)
      .maybeSingle()
      .throwOnError();

    const answeredAt = new Date().toISOString();

    await admin
      .from('lender_room_timeline_answer')
      .upsert({
        room_id: input.roomId,
        answer: input.answer,
        answered_at: answeredAt,
        answered_by: user.id,
        source: 'lender',
        note: input.note,
        earliest_close_date: input.earliestCloseDate,
      })
      .throwOnError();

    const { data: room } = await admin
      .from('lender_room')
      .select('account_id, deal_id, name, accounts(slug)')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    if (stored?.answer !== input.answer) {
      await notifyOurTeam({
        eventType: 'lender_room.timeline_answered',
        accountId: room.account_id,
        eventKey: `${input.roomId}:${answeredAt}`,
        payload: { roomId: input.roomId, answer: input.answer },
      });
    } else if (
      stored.note !== input.note ||
      stored.earliest_close_date !== input.earliestCloseDate
    ) {
      const body =
        input.note === null && input.earliestCloseDate === null
          ? `${room.name} cleared the note on its closing timeline answer.`
          : [
              `${room.name} added to its closing timeline answer:`,
              input.note === null ? null : `"${input.note}"`,
              input.earliestCloseDate === null
                ? null
                : `Earliest it can close: ${longDate(input.earliestCloseDate)}.`,
            ]
              .filter((part) => part !== null)
              .join(' ');

      await admin
        .from('notifications')
        .insert(
          (await ourTeamIds(admin, room.account_id)).map((userId) => ({
            account_id: room.account_id,
            recipient_user_id: userId,
            deal_id: room.deal_id,
            body,
            link: teamItemPath(
              z.string().parse(room.accounts.slug),
              room.deal_id,
              {
                kind: 'lender-timeline-answer',
                id: input.roomId,
              },
            ),
          })),
        )
        .throwOnError();
    }
  },
  { auth: true, schema: lenderTimelineAnswerSchema },
);

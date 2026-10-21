import { closeState } from '@odb/lender-rooms/rooms/closing.ts';
import { loadSellerRoomActivity } from '@odb/seller-rooms/activity/queries.ts';
import { loadSellerRoomFolders } from '@odb/seller-rooms/folders/queries.ts';
import { loadSellerMeetings } from '@odb/seller-rooms/meetings/queries.ts';
import {
  loadSellerRoomPeople,
  managersOnlyRefusal,
} from '@odb/seller-rooms/members/people.ts';
import { loadTeamQuestions } from '@odb/seller-rooms/questions/queries.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { AskTheSeller } from './ask-the-seller';
import { SellerRoomActivity } from './seller-room-activity';
import { SellerRoomFolders } from './seller-room-folders';
import { SellerRoomInvite } from './seller-room-invite';
import { SellerRoomLifecycle } from './seller-room-lifecycle';
import { SellerRoomMeetings } from './seller-room-meetings';
import { SellerRoomPeople } from './seller-room-people';
import { SellerRoomQuestions } from './seller-room-questions';
import { LiveRefresh } from './use-live-refresh';

export async function SellerRoomSection({ dealId }: { dealId: string }) {
  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();
  const [
    folders,
    meetings,
    people,
    questions,
    activity,
    { data: room },
    inviteRefusal,
    removeRefusal,
  ] = await Promise.all([
    loadSellerRoomFolders(client, dealId),
    loadSellerMeetings(client, dealId),
    loadSellerRoomPeople(client, dealId),
    loadTeamQuestions(client, dealId),
    loadSellerRoomActivity(client, admin, dealId),
    client
      .from('seller_room')
      .select('id, closed_at, deal(archived_at)')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    managersOnlyRefusal(client, admin, dealId, 'invite sellers'),
    managersOnlyRefusal(client, admin, dealId, 'remove sellers'),
  ]);

  const {
    data: { user },
  } = await client.auth.getUser();
  const closing = room
    ? await closeState(
        admin,
        { kind: 'seller', roomId: room.id },
        user!.id,
      )
    : null;
  const { data: comments } = room
    ? await client
        .rpc('seller_room_comments', { room_id: room.id })
        .throwOnError()
    : { data: [] };
  const { data: documents } = await client
    .from('dr_document')
    .select('id, name')
    .in(
      'id',
      comments.flatMap((comment) => comment.dr_document_id ?? []),
    )
    .throwOnError();
  const subjectOf = new Map([
    ...questions.map((question) => [question.id, question.title] as const),
    ...documents.map((document) => [document.id, document.name] as const),
  ]);

  return (
    <Card id={'seller-room'}>
      <CardHeader>
        <CardTitle>Seller room</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {room ? (
          <LiveRefresh
            table={'seller_room_comment'}
            column={'room_id'}
            value={room.id}
          />
        ) : null}
        {room && closing ? (
          <SellerRoomLifecycle
            dealId={dealId}
            isClosed={room.closed_at !== null}
            isDealArchived={room.deal.archived_at !== null}
            closing={closing}
          />
        ) : null}
        <SellerRoomInvite dealId={dealId} blockedReason={inviteRefusal} />
        <SellerRoomPeople
          dealId={dealId}
          people={people}
          blockedReason={removeRefusal}
        />
        <SellerRoomFolders dealId={dealId} folders={folders} />
        <SellerRoomMeetings dealId={dealId} meetings={meetings} />
        <AskTheSeller dealId={dealId} />
        <SellerRoomQuestions questions={questions} />
        <SellerCounselComments
          comments={comments.map((comment) => ({
            id: comment.id,
            author: comment.author,
            body: comment.body,
            subject: subjectOf.get(
              comment.question_id ?? comment.dr_document_id!,
            )!,
          }))}
        />
        <section className={'flex flex-col gap-2'}>
          <h3 className={'text-sm font-medium'}>Room activity</h3>
          <SellerRoomActivity dealId={dealId} entries={activity} />
        </section>
      </CardContent>
    </Card>
  );
}

export function SellerCounselComments({
  comments,
}: {
  comments: { id: string; author: string; body: string; subject: string }[];
}) {
  if (comments.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h3 className={'text-sm font-medium'}>Seller's counsel comments</h3>
      <ul className={'flex flex-col gap-2 text-sm'}>
        {comments.map((comment) => (
          <li key={comment.id}>
            <span className={'text-muted-foreground text-xs'}>
              {comment.author} on {comment.subject}
            </span>
            <p>{comment.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

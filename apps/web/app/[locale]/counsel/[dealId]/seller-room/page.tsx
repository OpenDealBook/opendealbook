import { notFound } from 'next/navigation';

import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { loadSellerCounselFolder } from '@odb/deal-counsel/seller-counsel-folder.ts';
import { filesUnder } from '@odb/lender-rooms/room-browser/room-places.ts';
import { loadSellerRoomListing } from '@odb/seller-rooms/files/listing.ts';
import { countDealTeam } from '@odb/seller-rooms/members/people.ts';
import { loadRoomQuestions } from '@odb/seller-rooms/questions/queries.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { LiveRefresh } from '../../../home/_components/use-live-refresh';
import { SellerRoomBrowser } from '../../../seller/(delivery)/rooms/[roomId]/seller-room-browser';
import { recordCounselVisit } from '../counsel-visit';
import { CommentForm } from './comment-form';
import { SellerCounselFolder } from './seller-counsel-folder';

interface Comment {
  id: string;
  author: string;
  body: string;
}

export default async function CounselSellerRoomPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  if (!(await enterCounselPortal(dealId)).includes('seller')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const [{ data: room }, { data: view }, { data: user }] = await Promise.all([
    client
      .from('seller_room')
      .select('id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError(),
    client.rpc('my_seller_rooms').eq('deal_id', dealId).single().throwOnError(),
    client.auth.getUser(),
  ]);

  const [
    listing,
    questions,
    { data: comments },
    teamSize,
    counselFolder,
    { data: readOnlyReason },
  ] = await Promise.all([
    loadSellerRoomListing(client, room.id),
    loadRoomQuestions(client, room.id),
    client.rpc('seller_room_comments', { room_id: room.id }).throwOnError(),
    countDealTeam(getSupabaseServerAdminClient(), room.id),
    loadSellerCounselFolder(client, dealId),
    client
      .rpc('seller_side_read_only_reason', { deal_id: dealId })
      .throwOnError(),
    recordCounselVisit(client, dealId, 'seller_room'),
  ]);

  const files = [
    ...filesUnder(listing.master!),
    ...filesUnder(listing.private!),
  ];
  const commentsOn = (subjectId: string): Comment[] =>
    comments.filter(
      (comment) =>
        comment.dr_document_id === subjectId ||
        comment.question_id === subjectId,
    );

  return (
    <main className={'flex flex-col gap-8'}>
      <h2 className={'font-serif text-2xl font-medium'}>Seller room</h2>
      <LiveRefresh
        table={'seller_room_comment'}
        column={'room_id'}
        value={room.id}
      />

      <SellerRoomBrowser
        roomId={room.id}
        userId={user.user!.id}
        teamName={view.team_name}
        teamSize={teamSize}
        counselHasJoined={false}
        places={{ shared: listing.master!, own: listing.private! }}
        readOnly={readOnlyReason !== null}
      />

      <SellerCounselFolder
        dealId={dealId}
        folders={counselFolder!.folders}
        files={counselFolder!.files}
        readOnly={readOnlyReason !== null}
      />

      <section className={'flex flex-col gap-3'}>
        <h2 className={'text-lg font-semibold'}>Comments on files</h2>
        {readOnlyReason ? (
          <p className={'text-muted-foreground text-sm'}>{readOnlyReason}</p>
        ) : null}
        {files.map((file) => (
          <article
            key={file.documentId}
            className={'flex flex-col gap-2 rounded-md border p-3'}
          >
            <h3 className={'font-medium'}>{file.name}</h3>
            <CommentThread comments={commentsOn(file.documentId)} />
            {readOnlyReason ? null : (
              <CommentForm
                roomId={room.id}
                subject={{ dr_document_id: file.documentId }}
                label={`Comment on ${file.name}`}
              />
            )}
          </article>
        ))}
      </section>

      <section className={'flex flex-col gap-3'}>
        <h2 className={'text-lg font-semibold'}>
          Questions from {view.team_name}
        </h2>
        <p className={'text-muted-foreground text-sm'}>
          Only the seller answers. Your comments are seen by the seller and{' '}
          {view.team_name}.
        </p>
        {questions.map((question) => (
          <article
            key={question.id}
            className={'flex flex-col gap-2 rounded-md border p-3'}
          >
            <h3 className={'font-medium'}>{question.title}</h3>
            {question.body ? (
              <p className={'text-sm'}>{question.body}</p>
            ) : null}
            <ul className={'flex flex-col gap-1 text-sm'}>
              {question.messages.map((message) => (
                <li key={message.id}>
                  <span className={'font-medium'}>
                    {message.side === 'seller' ? 'Seller' : view.team_name}:
                  </span>{' '}
                  {message.body}
                </li>
              ))}
              {question.files.map((file) => (
                <li key={file.documentId}>{file.name}</li>
              ))}
            </ul>
            <CommentThread comments={commentsOn(question.id)} />
            {readOnlyReason ? null : (
              <CommentForm
                roomId={room.id}
                subject={{ question_id: question.id }}
                label={`Comment on ${question.title}`}
              />
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function CommentThread({ comments }: { comments: Comment[] }) {
  return (
    <ul className={'flex flex-col gap-1 text-sm'}>
      {comments.map((comment) => (
        <li key={comment.id}>
          <span className={'font-medium'}>{comment.author}:</span>{' '}
          {comment.body}
        </li>
      ))}
    </ul>
  );
}

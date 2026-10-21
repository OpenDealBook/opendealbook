import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { z } from 'zod';

import { listSellerCounsel } from '@odb/deal-counsel/invite-seller-counsel.ts';
import { loadSellerCounselFolder } from '@odb/deal-counsel/seller-counsel-folder.ts';
import { FIXED_MILESTONES } from '@odb/deal-timeline/schema.ts';
import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { filesUnder } from '@odb/lender-rooms/room-browser/room-places.ts';
import { loadSellerRoomListing } from '@odb/seller-rooms/files/listing.ts';
import { listSharedMeetings } from '@odb/seller-rooms/meetings/queries.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import { countDealTeam } from '@odb/seller-rooms/members/people.ts';
import {
  loadQuestionAskers,
  loadRoomQuestions,
} from '@odb/seller-rooms/questions/queries.ts';
import { loadClosedSellerRoom } from '@odb/seller-rooms/rooms/closed-room.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { SellerCounselFolder } from '../../../../counsel/[dealId]/seller-room/seller-counsel-folder';
import { MainContacts } from '../../../../lender/[roomId]/main-contacts';
import { SharedTimeline } from '../../../../lender/[roomId]/shared-timeline';
import { SharedUpdates } from '../../../../lender/[roomId]/shared-updates';
import { ClosedRoom } from './closed-room';
import { NextStep } from './next-step';
import { RoomDocuments } from './room-documents';
import { RoomLegacyQuestions } from './room-legacy-questions';
import { RoomMeetings } from './room-meetings';
import { RoomQuestions } from './room-questions';
import { SellerCounselInvite } from './seller-counsel-invite';
import { SellerRoomBrowser } from './seller-room-browser';
import { StageStrip } from './stage-strip';

export default async function SellerRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  if (!z.uuid().safeParse(roomId).success) {
    notFound();
  }

  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect(sellerSignInPath(sellerRoomPath(roomId)));
  }

  const { data: room } = await client
    .rpc('my_seller_rooms')
    .eq('id', roomId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    notFound();
  }

  const [{ data: isSeller }, { data: readOnlyReason }] = await Promise.all([
    client
      .rpc('is_deal_seller_room_member', { deal_id: room.deal_id })
      .throwOnError(),
    client
      .rpc('seller_side_read_only_reason', { deal_id: room.deal_id })
      .throwOnError(),
  ]);

  return (
    <main className={'flex flex-col gap-4'}>
      <header className={'flex items-center gap-3'}>
        {room.team_picture_url ? (
          <img
            src={room.team_picture_url}
            alt={''}
            className={'h-10 w-10 rounded-md object-cover'}
          />
        ) : null}
        <div>
          <h1 className={'text-2xl font-semibold'}>Selling {room.deal_name}</h1>
          <p className={'text-muted-foreground text-sm'}>
            with {room.team_name}
          </p>
        </div>
      </header>

      {room.is_open ? (
        readOnlyReason ? (
          <p className={'text-muted-foreground'}>{readOnlyReason}</p>
        ) : null
      ) : (
        <ClosedSellerRoom
          roomId={roomId}
          teamName={room.team_name}
          readOnlyReason={readOnlyReason!}
        />
      )}
      <RoomContents
        roomId={roomId}
        dealId={room.deal_id}
        teamName={room.team_name}
        readOnly={readOnlyReason !== null}
      />

      {isSeller ? (
        <>
          <Link
            className={'underline'}
            href={`${sellerRoomPath(roomId)}/counsel`}
          >
            Messages with your counsel
          </Link>
          <SellerCounselInvite
            dealId={room.deal_id}
            counsel={await listSellerCounsel(room.deal_id)}
            readOnly={readOnlyReason !== null}
          />
          <SellerSideFolder
            dealId={room.deal_id}
            readOnly={readOnlyReason !== null}
          />
        </>
      ) : null}
    </main>
  );
}

async function SellerSideFolder({
  dealId,
  readOnly,
}: {
  dealId: string;
  readOnly: boolean;
}) {
  const folder = await loadSellerCounselFolder(
    getSupabaseServerClient(),
    dealId,
  );

  return folder ? (
    <SellerCounselFolder
      dealId={dealId}
      folders={folder.folders}
      files={folder.files}
      readOnly={readOnly}
    />
  ) : null;
}

async function ClosedSellerRoom({
  roomId,
  teamName,
  readOnlyReason,
}: {
  roomId: string;
  teamName: string;
  readOnlyReason: string;
}) {
  const { contactEmail, isDealArchived } = await loadClosedSellerRoom(
    getSupabaseServerAdminClient(),
    roomId,
  );

  return (
    <ClosedRoom
      roomId={roomId}
      teamName={teamName}
      contactEmail={contactEmail}
      canAskToReopen={!isDealArchived}
      readOnlyReason={readOnlyReason}
    />
  );
}

async function RoomContents({
  roomId,
  dealId,
  teamName,
  readOnly,
}: {
  roomId: string;
  dealId: string;
  teamName: string;
  readOnly: boolean;
}) {
  const client = getSupabaseServerClient();
  const [
    listing,
    { data },
    { data: documents },
    meetings,
    questions,
    askers,
    { data: legacyQuestions },
    { data: mainContacts },
    { data: milestones },
    { data: updates },
    teamSize,
    counsel,
    { data: header },
    { data: comments },
    { data: contracts },
    { data: waitingItems },
  ] = await Promise.all([
    loadSellerRoomListing(client, roomId),
    client.auth.getUser(),
    client.rpc('seller_room_documents', { room_id: roomId }).throwOnError(),
    listSharedMeetings(client, roomId),
    loadRoomQuestions(client, roomId),
    loadQuestionAskers(getSupabaseServerAdminClient(), roomId),
    client
      .rpc('seller_room_legacy_questions', { room_id: roomId })
      .throwOnError(),
    client.rpc('seller_room_main_contacts', { room_id: roomId }).throwOnError(),
    client.rpc('seller_room_timeline', { room_id: roomId }).throwOnError(),
    client.rpc('seller_room_updates', { room_id: roomId }).throwOnError(),
    countDealTeam(getSupabaseServerAdminClient(), roomId),
    listSellerCounsel(dealId),
    client
      .rpc('seller_deal_header', { deal_id: dealId })
      .single()
      .throwOnError(),
    client.rpc('seller_room_comments', { room_id: roomId }).throwOnError(),
    client.rpc('seller_side_contracts', { deal_id: dealId }).throwOnError(),
    client.rpc('seller_waiting_items', { deal_id: dealId }).throwOnError(),
  ]);
  const files = [
    ...filesUnder(listing.private!),
    ...filesUnder(listing.master!),
  ];
  const commentedFiles = files.flatMap((file) => {
    const onFile = comments.filter(
      (comment) => comment.dr_document_id === file.documentId,
    );

    return onFile.length > 0 ? [{ ...file, comments: onFile }] : [];
  });

  return (
    <>
      <NextStep
        questions={questions.filter((question) => question.status === 'open')}
        deadlines={milestones.flatMap((milestone) =>
          milestone.target_on !== null && milestone.actual_on === null
            ? [
                {
                  label:
                    milestone.kind === 'custom'
                      ? milestone.label!
                      : FIXED_MILESTONES[milestone.kind].label,
                  targetOn: milestone.target_on,
                },
              ]
            : [],
        )}
        items={waitingItems}
        today={header.today}
      />
      <section
        aria-labelledby={'your-contact'}
        className={'flex flex-col gap-1 rounded-lg border p-4'}
      >
        <h2 id={'your-contact'} className={'text-muted-foreground text-sm'}>
          Your contact at {teamName}
        </h2>
        <p className={'text-lg font-semibold'}>{header.contact_name}</p>
        {header.contact_phone ? (
          <a href={`tel:${header.contact_phone}`} className={'underline'}>
            {header.contact_phone}
          </a>
        ) : null}
      </section>
      <StageStrip current={header.public_stage} />
      {contracts.length > 0 ? (
        <Link
          className={'underline'}
          href={`${sellerRoomPath(roomId)}/contracts`}
        >
          Contracts
        </Link>
      ) : null}
      <SellerRoomBrowser
        roomId={roomId}
        userId={data.user!.id}
        teamName={teamName}
        teamSize={teamSize}
        counselHasJoined={counsel.some((each) => each.joined)}
        places={{ shared: listing.master!, own: listing.private! }}
        readOnly={readOnly}
      />
      {commentedFiles.length > 0 ? (
        <section className={'flex flex-col gap-3'}>
          <h2 className={'text-lg font-semibold'}>Comments on files</h2>
          {commentedFiles.map((file) => (
            <article
              key={file.documentId}
              className={'flex flex-col gap-2 rounded-md border p-3'}
            >
              <h3 className={'font-medium'}>{file.name}</h3>
              <ul className={'flex flex-col gap-1 text-sm'}>
                {file.comments.map((comment) => (
                  <li key={comment.id}>
                    <span className={'font-medium'}>{comment.author}:</span>{' '}
                    {comment.body}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}
      <RoomDocuments
        roomId={roomId}
        teamName={teamName}
        documents={documents}
      />
      <MainContacts contacts={mainContacts} />
      <SharedTimeline milestones={milestones} />
      <SharedUpdates updates={updates} />
      <RoomQuestions
        teamName={teamName}
        askers={askers}
        questions={questions}
        files={files.map((file) => ({
          documentId: file.documentId,
          name: file.name,
        }))}
        comments={comments}
        readOnly={readOnly}
      />
      <RoomLegacyQuestions questions={legacyQuestions} />
      <RoomMeetings roomId={roomId} meetings={meetings} />
    </>
  );
}

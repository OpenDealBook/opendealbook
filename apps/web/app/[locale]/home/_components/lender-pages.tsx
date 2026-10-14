import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import {
  fetchRoomActivity,
  fetchSeenBy,
} from '@odb/lender-rooms/activity/queries.ts';
import { getAsk } from '@odb/lender-rooms/asks/queries.ts';
import { brandLogoUrl } from '@odb/lender-rooms/brand/logo-url.ts';
import { headerFacts } from '@odb/lender-rooms/browser/header-facts.ts';
import type { MarkedRoomFolder } from '@odb/lender-rooms/contents/listing.ts';
import { loadRoomListing } from '@odb/lender-rooms/contents/load-listing.ts';
import { loadPackageListing } from '@odb/lender-rooms/contents/load-package.ts';
import { listFormSignatures } from '@odb/lender-rooms/esign/queries.ts';
import { getForm } from '@odb/lender-rooms/forms/queries.ts';
import {
  listLenderMembers,
  listRemovedLenderMembers,
} from '@odb/lender-rooms/members/actions.ts';
import {
  loadRequests,
  loadThread,
  requireRequestInRoom,
} from '@odb/lender-rooms/requests-ui/load-requests.ts';
import { newestSignature } from '@odb/lender-rooms/requests-ui/request-access.ts';
import { openRequestCounts } from '@odb/lender-rooms/requests-ui/wording.ts';
import { listLenderRooms } from '@odb/lender-rooms/rooms/actions.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@odb/ui/tabs';

import { managesDeal } from './lender-manages-deal';
import { LenderMark } from './lender-mark';
import { LenderPackage } from './lender-package';
import {
  areUuids,
  requestKind,
  dealTeamRoots,
  roomTab,
} from './lender-page-params';
import { withRoomStats } from './lender-people-stats';
import { RequestBadges } from './lender-request-badges';
import { LenderRequestInbox } from './lender-request-inbox';
import { LenderRequestThread } from './lender-request-thread';
import { RoomStatusBadge } from './lender-room-access';
import { LenderRoomActivity } from './lender-room-activity';
import { LenderRoomFiles } from './lender-room-files';
import { LenderRoomLifecycle } from './lender-room-lifecycle';
import type { LenderRoomRow } from './lender-room-list';
import {
  lastLenderActivityAt,
  orderRooms,
  roomAccess,
} from './lender-room-order';
import { LenderRoomPeople } from './lender-room-people';
import { LenderRoomsOverview } from './lender-rooms-overview';
import { waitingOnUsWording } from './lender-wording';

function acceptedOrNotFound<Value>(result: ActionResult<Value>): Value {
  if (!result.ok) {
    notFound();
  }

  return result.value;
}

function waitingOnUs(requests: Awaited<ReturnType<typeof loadRequests>>) {
  return openRequestCounts([...requests.asks, ...requests.forms]).waitingOnTeam;
}

async function requireManagedDeal(dealId: string, accountId: string) {
  if (!(await managesDeal(dealId, accountId))) {
    notFound();
  }
}

async function loadRoom(roomId: string) {
  const client = getSupabaseServerClient();

  const [view, members, requests, activity] = await Promise.all([
    client.rpc('lender_room_view', { room_id: roomId }).single().throwOnError(),
    listLenderMembers({ roomId }).then(acceptedOrNotFound),
    loadRequests(client, roomId),
    fetchRoomActivity(client, roomId),
  ]);
  const facts = headerFacts(view.data);

  return {
    view: view.data,
    initials: facts.initials,
    logoUrl: facts.logoPath ? await brandLogoUrl(facts.logoPath) : null,
    members,
    requests,
    activity,
  };
}

export async function LenderRoomsPage({
  dealId,
  accountId,
  accountSlug,
  basePath,
}: {
  dealId: string;
  accountId: string;
  accountSlug: string;
  basePath: string;
}) {
  await requireManagedDeal(dealId, accountId);

  const [rooms, pkg] = await Promise.all([
    listLenderRooms({ dealId }).then(acceptedOrNotFound),
    loadPackageListing(getSupabaseServerClient(), dealId),
  ]);

  const rows = await Promise.all(
    rooms.map(async (room): Promise<LenderRoomRow> => {
      const loaded = await loadRoom(room.id);

      return {
        id: room.id,
        name: room.name,
        initials: loaded.initials,
        logoUrl: loaded.logoUrl,
        status: room.status,
        access: roomAccess({
          closedAt: room.closed_at,
          expiresAt: room.expires_at,
          isOpen: loaded.view.is_open,
        }),
        peopleCount: loaded.members.length,
        waitingOnUs: waitingOnUs(loaded.requests),
        lastActivityAt: lastLenderActivityAt(loaded.activity),
      };
    }),
  );

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <LenderRoomsOverview
        dealId={dealId}
        basePath={basePath}
        rows={orderRooms(rows)}
      />
      <LenderPackage accountSlug={accountSlug} dealId={dealId} pkg={pkg} />
    </main>
  );
}

interface RoomAddress {
  dealId: string;
  accountId: string;
  roomId: string;
  basePath: string;
}

async function requireManagedRoom({ dealId, accountId, roomId }: RoomAddress) {
  if (!areUuids(roomId)) {
    notFound();
  }

  await requireManagedDeal(dealId, accountId);

  const { data: room } = await getSupabaseServerClient()
    .from('lender_room')
    .select('id, name, status, expires_at, closed_at')
    .eq('id', roomId)
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    notFound();
  }

  return room;
}

export async function LenderRoomPage({
  tab,
  ...address
}: RoomAddress & { tab: string | undefined }) {
  const { roomId, basePath } = address;
  const room = await requireManagedRoom(address);
  const client = getSupabaseServerClient();

  const [loaded, removed, listing, seenBy] = await Promise.all([
    loadRoom(roomId),
    listRemovedLenderMembers({ roomId }).then(acceptedOrNotFound),
    loadDealTeamListing(roomId),
    fetchSeenBy(client, roomId),
  ]);
  const waiting = waitingOnUs(loaded.requests);
  const roomPath = `${basePath}/${roomId}`;

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <header className={'flex flex-col gap-4'}>
        <Link
          href={basePath}
          className={
            'text-muted-foreground hover:text-foreground w-fit text-sm'
          }
        >
          All lenders
        </Link>
        <div className={'flex items-center gap-4'}>
          <LenderMark
            name={room.name}
            initials={loaded.initials}
            logoUrl={loaded.logoUrl}
            className={'size-14 text-xl'}
          />
          <h1 className={'font-serif text-3xl leading-tight font-medium'}>
            {room.name}
          </h1>
          <RoomStatusBadge status={room.status} />
        </div>
      </header>
      <Tabs defaultValue={roomTab(tab)} className={'gap-6'}>
        <TabsList>
          <TabsTrigger value={'requests'}>
            Requests{waiting > 0 ? ` (${waitingOnUsWording(waiting)})` : ''}
          </TabsTrigger>
          <TabsTrigger value={'files'}>Files</TabsTrigger>
          <TabsTrigger value={'activity'}>Activity</TabsTrigger>
          <TabsTrigger value={'people'}>
            People ({loaded.members.length})
          </TabsTrigger>
          <TabsTrigger value={'settings'}>Status and access</TabsTrigger>
        </TabsList>
        <TabsContent value={'requests'}>
          <LenderRequestInbox
            roomPath={roomPath}
            asks={loaded.requests.asks}
            forms={loaded.requests.forms}
          />
        </TabsContent>
        <TabsContent value={'files'}>
          <LenderRoomFiles roomId={roomId} listing={listing} seenBy={seenBy} />
        </TabsContent>
        <TabsContent value={'activity'}>
          <LenderRoomActivity
            roomId={roomId}
            roomPath={roomPath}
            entries={loaded.activity}
          />
        </TabsContent>
        <TabsContent value={'people'}>
          <LenderRoomPeople
            roomId={roomId}
            members={withRoomStats(loaded.members, loaded.activity)}
            removed={withRoomStats(
              removed.map((person) => ({ ...person, user_id: person.userId })),
              loaded.activity,
            )}
          />
        </TabsContent>
        <TabsContent value={'settings'}>
          <LenderRoomLifecycle
            room={{
              id: roomId,
              name: room.name,
              status: room.status,
              access: roomAccess({
                closedAt: room.closed_at,
                expiresAt: room.expires_at,
                isOpen: loaded.view.is_open,
              }),
              welcomeNote: loaded.view.welcome_note,
            }}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

async function loadDealTeamListing(roomId: string) {
  const roots = dealTeamRoots(
    await loadRoomListing(getSupabaseServerClient(), { roomId, since: null }),
  );

  if (roots === null) {
    notFound();
  }

  return roots;
}

function packageFolderPaths(
  folder: MarkedRoomFolder,
  above: string[] = [],
): { id: string; path: string }[] {
  const names = [...above, folder.name];

  return [
    { id: folder.id, path: names.join(' / ') },
    ...folder.folders.flatMap((child) => packageFolderPaths(child, names)),
  ];
}

export async function LenderRequestPage({
  kindSegment,
  requestId,
  ...address
}: RoomAddress & { kindSegment: string; requestId: string }) {
  const kind = requestKind(kindSegment);

  if (kind === null) {
    notFound();
  }

  const { roomId, basePath } = address;
  const room = await requireManagedRoom(address);
  const client = getSupabaseServerClient();

  await requireRequestInRoom(client, { kind, roomId, requestId });

  const request =
    kind === 'ask'
      ? await getAsk(client, requestId)
      : await getForm(client, requestId);

  const [thread, listing, signatures] = await Promise.all([
    loadThread(client, request),
    loadDealTeamListing(roomId),
    kind === 'form' ? listFormSignatures(client, requestId) : [],
  ]);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <header className={'flex flex-col gap-3'}>
        <Link
          href={`${basePath}/${roomId}?tab=requests`}
          className={
            'text-muted-foreground hover:text-foreground w-fit text-sm'
          }
        >
          {room.name} requests
        </Link>
        <h1 className={'font-serif text-2xl font-medium break-words'}>
          {request.title}
        </h1>
        <div className={'flex flex-wrap items-center gap-2 text-sm'}>
          <RequestBadges
            isForm={kind === 'form'}
            request={{
              ...request,
              latest_signature_status:
                newestSignature(signatures)?.status ?? null,
            }}
          />
        </div>
      </header>
      <LenderRequestThread
        roomId={roomId}
        privateFolderId={listing.private.id}
        request={{
          kind,
          id: request.id,
          status: request.status,
          return_route: request.return_route,
        }}
        thread={thread}
        fulfilmentFileIds={Object.fromEntries(
          kind === 'ask'
            ? request.files
                .filter((file) => file.role === 'fulfilment')
                .map((file) => [file.dr_document_id, file.id])
            : [],
        )}
        packageFolders={packageFolderPaths(listing.master)}
        signatures={signatures}
      />
    </main>
  );
}

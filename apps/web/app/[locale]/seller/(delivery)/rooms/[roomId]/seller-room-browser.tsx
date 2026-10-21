'use client';

import { useMemo } from 'react';

import {
  RoomBrowser,
  type RoomBrowserLabels,
} from '@odb/lender-rooms/room-browser/room-browser.tsx';
import type { RoomPlaces } from '@odb/lender-rooms/room-browser/room-places.ts';
import {
  recordSellerFolderOpened,
  recordSellerRoomOpened,
} from '@odb/seller-rooms/files/tracking-actions.ts';

const UPLOADS = 'Uploads';

export function SellerRoomBrowser({
  roomId,
  userId,
  teamName,
  teamSize,
  counselHasJoined,
  places,
  readOnly,
}: {
  roomId: string;
  userId: string;
  teamName: string;
  teamSize: number;
  counselHasJoined: boolean;
  places: RoomPlaces;
  readOnly: boolean;
}) {
  const shared = `From ${teamName}`;
  const space = useMemo(() => ({ sellerRoomId: roomId }), [roomId]);

  const labels: RoomBrowserLabels = {
    shared,
    own: UPLOADS,
    emptyShared: `Documents will appear here as ${teamName} shares them`,
    ownOnlyConsent: (names) =>
      `${names} will go to ${UPLOADS}. ${teamName}${teamName.endsWith('s') ? "'" : "'s"} deal team (${teamSize} ${teamSize === 1 ? 'person' : 'people'})${counselHasJoined ? ' and your counsel' : ''} will see it.`,
    sent: `Sent to ${teamName}. They've been notified.`,
  };

  const tracking = useMemo(
    () => ({
      recordRoomOpened: () => recordSellerRoomOpened({ roomId }),
      recordFolderOpened: (folderId: string) =>
        recordSellerFolderOpened({ roomId, folderId }),
    }),
    [roomId],
  );

  return (
    <RoomBrowser
      space={space}
      userId={userId}
      places={places}
      labels={labels}
      tracking={tracking}
      readOnly={readOnly}
    />
  );
}

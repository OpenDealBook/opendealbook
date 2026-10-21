'use client';

import { useCallback, useMemo } from 'react';

import { recordFolderOpened, recordRoomOpened } from '../activity/actions';
import { AskComposer } from '../requests-ui/ask-composer';
import { teamName } from '../requests-ui/wording';
import {
  type RequestComposerProps,
  RoomBrowser,
  type RoomBrowserLabels,
} from '../room-browser/room-browser';
import type { RoomPlaces } from '../room-browser/room-places';

const OWN_SPACE = 'Your files';

export function LenderRoomBrowser({
  roomId,
  userId,
  places,
  packageLabel,
  dealName,
}: {
  roomId: string;
  userId: string;
  places: RoomPlaces;
  packageLabel: string;
  dealName: string | null;
}) {
  const team = teamName(dealName);
  const space = useMemo(() => ({ roomId }), [roomId]);

  const labels: RoomBrowserLabels = {
    shared: packageLabel,
    own: OWN_SPACE,
    emptyShared: `Documents will appear here as ${team} adds them`,
  };

  const tracking = useMemo(
    () => ({
      recordRoomOpened: () => recordRoomOpened({ roomId }),
      recordFolderOpened: (folderId: string) =>
        recordFolderOpened({ roomId, folderId }),
    }),
    [roomId],
  );

  const RequestComposer = useCallback(
    (props: RequestComposerProps) => (
      <AskComposer
        roomId={roomId}
        privateFolderId={places.own.id}
        dealName={dealName}
        {...props}
      />
    ),
    [roomId, places.own.id, dealName],
  );

  return (
    <RoomBrowser
      space={space}
      userId={userId}
      places={places}
      labels={labels}
      tracking={tracking}
      RequestComposer={RequestComposer}
    />
  );
}

'use client';

import { useEffect } from 'react';

import { unfinishedMemory } from './unfinished-memory';

export function PurgeUnfinishedUploads({
  userId,
  openRoomIds,
}: {
  userId: string;
  openRoomIds: string[];
}) {
  const roomIds = openRoomIds.join(',');

  useEffect(() => {
    void unfinishedMemory.purge({
      userId,
      openRoomIds: roomIds.split(','),
      now: Date.now(),
    });
  }, [userId, roomIds]);

  return null;
}

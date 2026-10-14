// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import type { UnfinishedUpload } from './unfinished-uploads';

const kept = vi.hoisted(() => new Map<string, UnfinishedUpload>());

vi.mock('./unfinished-store', () => ({
  unfinishedStore: {
    put: async (upload: UnfinishedUpload) => {
      kept.set(upload.id, upload);
    },
    remove: async (id: string) => {
      kept.delete(id);
    },
    listForPerson: async (userId: string) =>
      [...kept.values()].filter((upload) => upload.userId === userId),
  },
  forgottenIds: { read: () => [], write: () => {} },
  reportStoreFailure: () => {},
}));

import { PurgeUnfinishedUploads } from './purge-unfinished-uploads';

function left(roomId: string, userId: string, daysAgo = 1): UnfinishedUpload {
  return {
    id: `${roomId}/${userId}/${daysAgo}`,
    roomId,
    userId,
    name: `${roomId}.pdf`,
    folderId: 'folder',
    uploadId: null,
    file: null,
    savedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

it('drops what this person left in rooms they can no longer use, and anything past seven days', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  for (const upload of [
    left('open-room', 'ana'),
    left('closed-room', 'ana'),
    left('open-room', 'ana', 8),
    left('closed-room', 'ben'),
  ]) {
    kept.set(upload.id, upload);
  }

  const root = createRoot(document.createElement('div'));

  await act(async () =>
    root.render(
      <PurgeUnfinishedUploads userId={'ana'} openRoomIds={['open-room']} />,
    ),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  expect([...kept.values()].map(({ roomId, userId }) => `${roomId}/${userId}`)).toEqual([
    'open-room/ana',
    'closed-room/ben',
  ]);

  act(() => root.unmount());
  vi.unstubAllGlobals();
});

import { describe, expect, it } from 'vitest';

import {
  authDecision,
  createUnfinishedMemory,
  type ForgottenIds,
  lockName,
  restorePlan,
  settledKeys,
  type UnfinishedStore,
  type UnfinishedUpload,
  withoutSentElsewhere,
} from './unfinished-uploads';

const ROOM = 'room-1';
const ANA = 'ana';
const NOW = Date.parse('2026-10-14T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function unfinished(
  name: string,
  rest: Partial<UnfinishedUpload> = {},
): UnfinishedUpload {
  return {
    id: `${ROOM}/${ANA}/${name}`,
    roomId: ROOM,
    userId: ANA,
    name,
    folderId: 'forms',
    uploadId: null,
    file: new File(['x'], name),
    savedAt: new Date(NOW - DAY).toISOString(),
    ...rest,
  };
}

function fakeStore(
  options: {
    refusesFile?: boolean;
    refusesAll?: boolean;
    failsList?: boolean;
    failingRemovals?: number;
    putDelay?: number;
  } = {},
) {
  const kept = new Map<string, UnfinishedUpload>();
  let failingRemovals = options.failingRemovals ?? 0;
  const store: UnfinishedStore = {
    put: async (upload) => {
      await new Promise((resolve) =>
        setTimeout(resolve, options.putDelay ?? 0),
      );

      if (options.refusesAll || (upload.file && options.refusesFile)) {
        throw new Error('QuotaExceededError');
      }

      kept.set(upload.id, upload);
    },
    remove: async (id) => {
      if (failingRemovals > 0) {
        failingRemovals -= 1;
        throw new Error('TransactionInactiveError');
      }

      kept.delete(id);
    },
    listForPerson: async (userId) => {
      if (options.failsList) {
        throw new Error('UnknownError');
      }

      return [...kept.values()].filter((upload) => upload.userId === userId);
    },
  };

  return { store, kept };
}

function fakeForgotten(): ForgottenIds & { ids: string[] } {
  const forgotten = {
    ids: [] as string[],
    read: () => forgotten.ids,
    write: (ids: string[]) => {
      forgotten.ids = ids;
    },
  };

  return forgotten;
}

function memoryWith(store: UnfinishedStore, forgotten = fakeForgotten()) {
  const reported: unknown[] = [];

  return {
    memory: createUnfinishedMemory({
      store,
      forgotten,
      report: (error) => reported.push(error),
    }),
    reported,
    forgotten,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('remembering', () => {
  it('keeps the file itself when the browser will store it', async () => {
    const { store, kept } = fakeStore();
    const { memory } = memoryWith(store);

    const upload = unfinished('application.pdf');

    await memory.remember(upload);

    expect([...kept.values()]).toEqual([upload]);
  });

  it('keeps the name alone when the browser will not store the file', async () => {
    const { store, kept } = fakeStore({ refusesFile: true });
    const { memory } = memoryWith(store);

    await memory.remember(unfinished('application.pdf'));

    expect([...kept.values()]).toEqual([
      unfinished('application.pdf', { file: null }),
    ]);
  });

  it('does not stop the upload when the browser will store nothing, and reports it once', async () => {
    const { store, kept } = fakeStore({ refusesAll: true });
    const { memory, reported } = memoryWith(store);

    await memory.remember(unfinished('application.pdf'));

    expect(kept.size).toBe(0);
    expect(reported).toHaveLength(1);
  });

  it('never reports a finished upload as not kept, however late the fallback write lands', async () => {
    const { store, kept } = fakeStore({ refusesFile: true, putDelay: 5 });
    const { memory } = memoryWith(store);
    const upload = unfinished('application.pdf');

    memory.remember(upload);
    memory.forget(upload.id);
    await settle();

    expect(kept.size).toBe(0);
  });
});

describe('reading', () => {
  it('drops what is older than seven days without showing it', async () => {
    const { store, kept } = fakeStore();
    const { memory } = memoryWith(store);
    const old = unfinished('old.pdf', {
      savedAt: new Date(NOW - 8 * DAY).toISOString(),
    });

    await memory.remember(old);
    await memory.remember(unfinished('recent.pdf'));

    const read = await memory.read({ roomId: ROOM, userId: ANA, now: NOW });

    await settle();

    expect(read.map((upload) => upload.name)).toEqual(['recent.pdf']);
    expect([...kept.keys()]).toEqual([unfinished('recent.pdf').id]);
  });

  it('shows only this room for this person', async () => {
    const { store } = fakeStore();
    const { memory } = memoryWith(store);

    await memory.remember(unfinished('mine.pdf'));
    await memory.remember(
      unfinished('other-room.pdf', { roomId: 'room-2', id: 'room-2/ana/x' }),
    );
    await memory.remember(
      unfinished('other-person.pdf', { userId: 'ben', id: 'room-1/ben/x' }),
    );
    await settle();

    expect(
      (await memory.read({ roomId: ROOM, userId: ANA, now: NOW })).map(
        (upload) => upload.name,
      ),
    ).toEqual(['mine.pdf']);
  });

  it('shows nothing when the browser cannot read what it kept, and reports it', async () => {
    const { store } = fakeStore({ failsList: true });
    const { memory, reported } = memoryWith(store);

    expect(await memory.read({ roomId: ROOM, userId: ANA, now: NOW })).toEqual(
      [],
    );
    expect(reported).toHaveLength(1);
  });

  it('retries a failed removal before offering anything, so a finished upload is never offered again', async () => {
    const { store, kept } = fakeStore({ failingRemovals: 1 });
    const { memory, forgotten } = memoryWith(store);
    const finished = unfinished('finished.pdf');

    await memory.remember(finished);
    memory.forget(finished.id);
    await settle();

    expect(kept.has(finished.id)).toBe(true);
    expect(forgotten.ids).toEqual([finished.id]);

    expect(await memory.read({ roomId: ROOM, userId: ANA, now: NOW })).toEqual(
      [],
    );
    expect(kept.has(finished.id)).toBe(false);
    expect(forgotten.ids).toEqual([]);
  });

  it('ignores a record for the visit when its removal fails again', async () => {
    const { store, kept } = fakeStore({ failingRemovals: 2 });
    const { memory, forgotten } = memoryWith(store);
    const finished = unfinished('finished.pdf');

    await memory.remember(finished);
    memory.forget(finished.id);
    await settle();

    expect(await memory.read({ roomId: ROOM, userId: ANA, now: NOW })).toEqual(
      [],
    );
    expect(kept.has(finished.id)).toBe(true);
    expect(forgotten.ids).toEqual([finished.id]);
  });
});

describe('forgetting a person or a room', () => {
  it('forgets everything this person left, in every room, and nobody else', async () => {
    const { store, kept } = fakeStore();
    const { memory } = memoryWith(store);

    await memory.remember(unfinished('mine.pdf'));
    await memory.remember(
      unfinished('mine-elsewhere.pdf', {
        roomId: 'room-2',
        id: 'room-2/ana/x',
      }),
    );
    await memory.remember(
      unfinished('theirs.pdf', { userId: 'ben', id: 'room-1/ben/x' }),
    );
    await settle();
    await memory.forgetPerson(ANA);

    expect([...kept.values()].map((upload) => upload.name)).toEqual([
      'theirs.pdf',
    ]);
  });

  it('purges rooms the person can no longer use and anything past seven days', async () => {
    const { store, kept } = fakeStore();
    const { memory } = memoryWith(store);

    await memory.remember(unfinished('open-room.pdf'));
    await memory.remember(
      unfinished('closed-room.pdf', { roomId: 'room-2', id: 'room-2/ana/x' }),
    );
    await memory.remember(
      unfinished('old.pdf', {
        id: 'room-1/ana/old',
        savedAt: new Date(NOW - 8 * DAY).toISOString(),
      }),
    );
    await settle();
    await memory.purge({ userId: ANA, openRoomIds: [ROOM], now: NOW });

    expect([...kept.values()].map((upload) => upload.name)).toEqual([
      'open-room.pdf',
    ]);
  });
});

describe('settledKeys', () => {
  it('forgets uploads that were added, refused, or removed, and keeps the rest', () => {
    expect(
      settledKeys(
        [
          {
            key: 'added',
            name: 'a',
            state: { kind: 'attached', documentIds: [] },
          },
          {
            key: 'refused',
            name: 'b',
            state: { kind: 'refused', message: 'no' },
          },
          { key: 'uploading', name: 'c', state: { kind: 'uploading' } },
          { key: 'failed', name: 'd', state: { kind: 'failed' } },
          {
            key: 'held',
            name: 'e.zip',
            state: { kind: 'held', uploadId: 'u' },
          },
        ],
        ['added', 'refused', 'uploading', 'failed', 'held', 'removed'],
      ),
    ).toEqual(['added', 'refused', 'removed']);
  });
});

describe('restorePlan', () => {
  const stillThere = (folderId: string) => folderId !== 'gone';

  it('asks to continue the files it kept, into the folders they were headed for', () => {
    const application = unfinished('application.pdf');
    const forms = unfinished('forms.zip', {
      folderId: 'own',
      uploadId: 'upload-7',
    });
    const plan = restorePlan([application, forms], {
      folderExists: stillThere,
      ownFolderId: 'own',
    });

    expect(plan.question).toBe(
      'You have 2 uploads that did not finish. Continue uploading?',
    );
    expect(plan.resumable).toEqual([
      { file: application.file, folderId: 'forms' },
      { file: forms.file, folderId: 'own' },
    ]);
    expect(plan.staleUploadIds).toEqual(['upload-7']);
    expect(plan.lost).toBeNull();
    expect(plan.movedToYourFiles).toBe(false);
  });

  it('sends a file whose folder is gone to the top of their own files, and says so', () => {
    const plan = restorePlan([unfinished('w9.pdf', { folderId: 'gone' })], {
      folderExists: stillThere,
      ownFolderId: 'own',
    });

    expect(plan.resumable.map((upload) => upload.folderId)).toEqual(['own']);
    expect(plan.movedToYourFiles).toBe(true);
  });

  it('says one upload in the singular', () => {
    expect(
      restorePlan([unfinished('application.pdf')], {
        folderExists: stillThere,
        ownFolderId: 'own',
      }).question,
    ).toBe('You have 1 upload that did not finish. Continue uploading?');
  });

  it('names the files it could not keep, as a sentence', () => {
    const plan = restorePlan(
      [
        unfinished('big.pdf', { file: null }),
        unfinished('bigger.pdf', { file: null }),
      ],
      { folderExists: stillThere, ownFolderId: 'own' },
    );

    expect(plan.question).toBeNull();
    expect(plan.lost).toBe(
      'These did not finish and need to be added again: big.pdf, bigger.pdf.',
    );
  });
});

describe('other tabs', () => {
  it('offers nothing another tab of this browser is still sending', () => {
    const sending = unfinished('sending.pdf');
    const waiting = unfinished('waiting.pdf');

    expect(
      withoutSentElsewhere([sending, waiting], [lockName(sending.id)]),
    ).toEqual([waiting]);
  });
});

describe('authDecision', () => {
  it('keeps going for the same person', () => {
    expect(authDecision('TOKEN_REFRESHED', ANA, ANA)).toBe('keep');
  });

  it('reloads when someone else is now signed in', () => {
    expect(authDecision('SIGNED_IN', 'ben', ANA)).toBe('reload');
  });

  it('forgets this person and reloads on sign-out', () => {
    expect(authDecision('SIGNED_OUT', null, ANA)).toBe('forget-and-reload');
  });
});

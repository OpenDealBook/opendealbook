import type { QueuedUpload } from '../requests-ui/upload-queue';

export interface UnfinishedUpload {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  folderId: string;
  uploadId: string | null;
  file: File | null;
  savedAt: string;
}

export interface UnfinishedStore {
  put(upload: UnfinishedUpload): Promise<void>;
  remove(id: string): Promise<void>;
  listForPerson(userId: string): Promise<UnfinishedUpload[]>;
}

export interface ForgottenIds {
  read(): string[];
  write(ids: string[]): void;
}

const KEPT_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isExpired(upload: UnfinishedUpload, now: number): boolean {
  return now - Date.parse(upload.savedAt) > KEPT_FOR_MS;
}

export function createUnfinishedMemory({
  store,
  forgotten,
  report,
}: {
  store: UnfinishedStore;
  forgotten: ForgottenIds;
  report: (error: unknown) => void;
}) {
  const writesById = new Map<string, Promise<void>>();

  function inOrder(id: string, write: () => Promise<void>): Promise<void> {
    const next = (writesById.get(id) ?? Promise.resolve()).then(write);

    writesById.set(id, next);

    return next;
  }

  function remove(id: string): Promise<void> {
    return store.remove(id).catch((error: unknown) => {
      report(error);
      forgotten.write([...new Set([...forgotten.read(), id])]);
    });
  }

  async function listForPerson(userId: string): Promise<UnfinishedUpload[]> {
    return store.listForPerson(userId).catch((error: unknown) => {
      report(error);

      return [];
    });
  }

  return {
    remember(upload: UnfinishedUpload): Promise<void> {
      return inOrder(upload.id, () =>
        store
          .put(upload)
          .catch(() => store.put({ ...upload, file: null }))
          .catch(report),
      );
    },
    forget(id: string): Promise<void> {
      return inOrder(id, () => remove(id));
    },
    async read({
      roomId,
      userId,
      now,
    }: {
      roomId: string;
      userId: string;
      now: number;
    }): Promise<UnfinishedUpload[]> {
      const stillForgotten: string[] = [];

      for (const id of forgotten.read()) {
        await store.remove(id).catch(() => stillForgotten.push(id));
      }

      forgotten.write(stillForgotten);

      const kept = await listForPerson(userId);

      for (const upload of kept.filter((each) => isExpired(each, now))) {
        void remove(upload.id);
      }

      return kept.filter(
        (upload) =>
          upload.roomId === roomId &&
          !isExpired(upload, now) &&
          !stillForgotten.includes(upload.id),
      );
    },
    async forgetPerson(userId: string) {
      await Promise.all(
        (await listForPerson(userId)).map((upload) => remove(upload.id)),
      );
    },
    async purge({
      userId,
      openRoomIds,
      now,
    }: {
      userId: string;
      openRoomIds: string[];
      now: number;
    }) {
      await Promise.all(
        (await listForPerson(userId))
          .filter(
            (upload) =>
              !openRoomIds.includes(upload.roomId) || isExpired(upload, now),
          )
          .map((upload) => remove(upload.id)),
      );
    },
  };
}

export type UnfinishedMemory = ReturnType<typeof createUnfinishedMemory>;

export function settledKeys(
  queue: QueuedUpload[],
  rememberedKeys: string[],
): string[] {
  return rememberedKeys.filter((key) => {
    const upload = queue.find((each) => each.key === key);

    return (
      !upload ||
      upload.state.kind === 'attached' ||
      upload.state.kind === 'refused'
    );
  });
}

export function restorePlan(
  unfinished: UnfinishedUpload[],
  where: { folderExists: (folderId: string) => boolean; ownFolderId: string },
): {
  resumable: { file: File; folderId: string }[];
  staleUploadIds: string[];
  question: string | null;
  lost: string | null;
  movedToYourFiles: boolean;
} {
  const resumable = unfinished.flatMap(({ file, folderId }) =>
    file
      ? [
          {
            file,
            folderId: where.folderExists(folderId)
              ? folderId
              : where.ownFolderId,
          },
        ]
      : [],
  );
  const lostNames = unfinished.flatMap(({ file, name }) =>
    file ? [] : [name],
  );

  return {
    resumable,
    staleUploadIds: unfinished.flatMap(({ uploadId }) =>
      uploadId ? [uploadId] : [],
    ),
    question:
      resumable.length === 0
        ? null
        : `You have ${resumable.length} ${resumable.length === 1 ? 'upload that' : 'uploads that'} did not finish. Continue uploading?`,
    lost:
      lostNames.length === 0
        ? null
        : `These did not finish and need to be added again: ${lostNames.join(', ')}.`,
    movedToYourFiles: unfinished.some(
      ({ file, folderId }) => file !== null && !where.folderExists(folderId),
    ),
  };
}

export function lockName(id: string): string {
  return `lender-upload:${id}`;
}

export function withoutSentElsewhere(
  unfinished: UnfinishedUpload[],
  lockNamesHeldElsewhere: string[],
): UnfinishedUpload[] {
  return unfinished.filter(
    (upload) => !lockNamesHeldElsewhere.includes(lockName(upload.id)),
  );
}

export function authDecision(
  event: string,
  signedInUserId: string | null,
  pageUserId: string,
): 'keep' | 'reload' | 'forget-and-reload' {
  if (event === 'SIGNED_OUT') {
    return 'forget-and-reload';
  }

  return signedInUserId === pageUserId ? 'keep' : 'reload';
}

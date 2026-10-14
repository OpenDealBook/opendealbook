'use client';

import { useEffect, useRef, useState } from 'react';

import { getSupabaseBrowserClient } from '@odb/supabase/client';

import { heldUploads } from '../requests-ui/upload-queue';
import type { Uploads } from '../requests-ui/uploads';
import { cancelUpload } from '../uploads/actions';
import { reloadPage } from './reload-page';
import { signedInUserId } from './signed-in-user';
import {
  announceAnswered,
  holdWhileSending,
  lockNamesHeldElsewhere,
  onAnsweredElsewhere,
} from './tab-coordination';
import { unfinishedMemory as memory } from './unfinished-memory';
import {
  authDecision,
  restorePlan,
  settledKeys,
  type UnfinishedUpload,
  withoutSentElsewhere,
} from './unfinished-uploads';


async function isStillSignedInAs(userId: string): Promise<boolean> {
  return (await signedInUserId()) === userId;
}

export function useUnfinishedUploads({
  roomId,
  userId,
  uploads,
  ownFolderId,
  folderExists,
}: {
  roomId: string;
  userId: string;
  uploads: Uploads;
  ownFolderId: string;
  folderExists: (folderId: string) => boolean;
}) {
  const owner = `${roomId}/${userId}`;
  const [leftUnfinished, setLeftUnfinished] = useState<UnfinishedUpload[]>([]);
  const [isPromptDismissed, setIsPromptDismissed] = useState(false);
  const [movedToYourFiles, setMovedToYourFiles] = useState(false);
  const rememberedByKey = useRef(
    new Map<string, { upload: UnfinishedUpload; release: () => void }>(),
  );

  useEffect(() => {
    function readLeftUnfinished() {
      void Promise.all([
        memory.read({ roomId, userId, now: Date.now() }),
        lockNamesHeldElsewhere(),
      ]).then(([kept, heldElsewhere]) =>
        setLeftUnfinished(withoutSentElsewhere(kept, heldElsewhere)),
      );
    }

    readLeftUnfinished();

    return onAnsweredElsewhere(owner, readLeftUnfinished);
  }, [owner, roomId, userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      const decision = authDecision(event, session?.user.id ?? null, userId);

      if (decision === 'forget-and-reload') {
        void memory.forgetPerson(userId).then(reloadPage);
      } else if (decision === 'reload') {
        reloadPage();
      }
    });

    return () => subscription.unsubscribe();
  }, [userId]);

  useEffect(() => {
    const remembered = rememberedByKey.current;

    const settled = new Set(settledKeys(uploads.queue, [...remembered.keys()]));

    for (const [key, { upload, release }] of remembered) {
      if (settled.has(key)) {
        void memory.forget(upload.id);
        release();
        remembered.delete(key);
      }
    }

    for (const { key, uploadId } of heldUploads(uploads.queue)) {
      const waiting = remembered.get(key);

      if (waiting && waiting.upload.uploadId === null) {
        waiting.upload = { ...waiting.upload, uploadId };
        void memory.remember(waiting.upload);
      }
    }
  }, [uploads.queue]);

  async function upload(files: File[], into: string) {
    if (!(await isStillSignedInAs(userId))) {
      reloadPage();
      return;
    }

    for (const started of uploads.pick(files, into)) {
      const remembered = {
        id: `${owner}/${started.key}`,
        roomId,
        userId,
        name: started.file.name,
        folderId: into,
        uploadId: null,
        file: started.file,
        savedAt: new Date().toISOString(),
      };

      rememberedByKey.current.set(started.key, {
        upload: remembered,
        release: holdWhileSending(remembered.id),
      });
      void memory.remember(remembered);
    }
  }

  const plan = restorePlan(leftUnfinished, { folderExists, ownFolderId });

  async function forgetLeftUnfinished() {
    for (const uploadId of plan.staleUploadIds) {
      void cancelUpload({ uploadId });
    }

    setLeftUnfinished([]);
    await Promise.all(leftUnfinished.map(({ id }) => memory.forget(id)));
    announceAnswered(owner);
  }

  return {
    upload,
    movedToYourFiles,
    prompt:
      leftUnfinished.length > 0 && !isPromptDismissed
        ? { question: plan.question, lost: plan.lost }
        : null,
    dismiss() {
      setIsPromptDismissed(true);
    },
    discard() {
      void forgetLeftUnfinished();
    },
    async continueUploads() {
      if (!(await isStillSignedInAs(userId))) {
        reloadPage();
        return;
      }

      void forgetLeftUnfinished();
      setMovedToYourFiles(plan.movedToYourFiles);

      for (const { file, folderId } of plan.resumable) {
        void upload([file], folderId);
      }
    },
  };
}

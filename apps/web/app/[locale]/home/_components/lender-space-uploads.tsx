'use client';

import { type DragEvent, type ReactNode, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { NewFolderDialog } from '@odb/lender-rooms/room-browser/new-folder-dialog.tsx';
import { useFolderDrop } from '@odb/lender-rooms/room-browser/use-folder-drop.ts';
import {
  LiveRegion,
  RefusalNote,
} from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import {
  attachedDocumentIds,
  heldUploads,
} from '@odb/lender-rooms/requests-ui/upload-queue.ts';
import {
  AttachButton,
  KeepAsZipTick,
  UploadList,
  useUploads,
} from '@odb/lender-rooms/requests-ui/uploads.tsx';
import type { SpaceTarget } from '@odb/lender-rooms/uploads/targets.ts';
import { Button } from '@odb/ui/button';

import { teamSignInPath } from './lender-wording';

export interface SpaceActions {
  upload: (files: File[], folderId: string) => void;
  newFolder: (parentFolderId: string) => void;
  drop: (event: DragEvent, folderId: string) => void;
}

export function SpaceFolderControls({
  folder,
  actions,
}: {
  folder: { id: string; name: string };
  actions: SpaceActions;
}) {
  return (
    <span className={'flex items-center gap-1'}>
      <AttachButton
        onPick={(files) => actions.upload(files, folder.id)}
        multiple
      >
        {`Upload into ${folder.name}`}
      </AttachButton>
      <Button
        size={'sm'}
        variant={'ghost'}
        aria-label={`New folder in ${folder.name}`}
        onClick={() => actions.newFolder(folder.id)}
      >
        New folder
      </Button>
    </span>
  );
}

export function SpaceUploads({
  space,
  rootFolderId,
  title,
  description,
  addLabel,
  settleLabel,
  children,
}: {
  space: SpaceTarget;
  rootFolderId: string;
  title: string;
  description: string;
  addLabel: string;
  settleLabel: string;
  children: (actions: SpaceActions) => ReactNode;
}) {
  const router = useRouter();
  const [keepAsZip, setKeepAsZip] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const uploads = useUploads({ space, folderId: rootFolderId });
  const attachedCount = attachedDocumentIds(uploads.queue).length;
  const drop = useFolderDrop({
    space,
    startUploads: uploads.pick,
    onFoldersCreated: () => router.refresh(),
  });

  useEffect(() => {
    if (attachedCount > 0) {
      router.refresh();
    }
  }, [attachedCount, router]);

  return (
    <section
      data-drop-zone
      className={'flex flex-col gap-2'}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => drop.dropInto(event, rootFolderId)}
    >
      <div className={'flex flex-wrap items-end justify-between gap-2'}>
        <div className={'flex flex-col'}>
          <h2 className={'font-medium'}>{title}</h2>
          <p className={'text-muted-foreground text-sm'}>{description}</p>
        </div>
        <span className={'flex items-center gap-1'}>
          <AttachButton onPick={(files) => uploads.pick(files)} multiple>
            {addLabel}
          </AttachButton>
          <Button
            size={'sm'}
            variant={'ghost'}
            onClick={() => setNewFolderParent(rootFolderId)}
          >
            New folder
          </Button>
        </span>
      </div>
      {drop.problems.map((problem) => (
        <div key={problem.id} className={'flex items-start gap-2'}>
          <RefusalNote refusal={problem.text} signInPath={teamSignInPath} />
          <Button
            size={'sm'}
            variant={'ghost'}
            onClick={() => drop.dismissProblem(problem.id)}
          >
            Dismiss
          </Button>
        </div>
      ))}
      <UploadList
        signInPath={teamSignInPath}
        queuedKeys={uploads.queuedKeys}
        queue={uploads.queue}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      <KeepAsZipTick
        queue={uploads.queue}
        isTicked={keepAsZip}
        onTick={setKeepAsZip}
      />
      {heldUploads(uploads.queue).length > 0 ? (
        <Button
          size={'sm'}
          className={'w-fit'}
          onClick={() => void uploads.registerHeldUploads(keepAsZip)}
        >
          {settleLabel}
        </Button>
      ) : null}
      <LiveRegion message={uploads.announcement} />
      <div className={'bg-card rounded-lg border'}>
        {children({
          upload: uploads.pick,
          newFolder: setNewFolderParent,
          drop: drop.dropInto,
        })}
      </div>
      {newFolderParent === null ? null : (
        <NewFolderDialog
          space={space}
          parentFolderId={newFolderParent}
          signInPath={teamSignInPath}
          onClose={() => setNewFolderParent(null)}
        />
      )}
    </section>
  );
}

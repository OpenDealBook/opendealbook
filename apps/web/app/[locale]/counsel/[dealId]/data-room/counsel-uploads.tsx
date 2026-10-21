'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { openBuyerCounselUploads } from '@odb/deal-counsel/uploads.ts';
import { RefusalNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import {
  AttachButton,
  UploadList,
  useUploads,
} from '@odb/lender-rooms/requests-ui/uploads.tsx';
import { NewFolderDialog } from '@odb/lender-rooms/room-browser/new-folder-dialog.tsx';
import { Button } from '@odb/ui/button';

export interface CounselFolder {
  id: string;
  path: string;
}

export function CounselUploads({
  dealId,
  folders,
}: {
  dealId: string;
  folders: CounselFolder[];
}) {
  const router = useRouter();
  const space = { counselDealId: dealId };
  const [target, setTarget] = useState(folders[0]?.id ?? '');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const uploads = useUploads({ space, folderId: target });
  const finished =
    uploads.queue.length > 0 &&
    uploads.queue.every((upload) => upload.state.kind === 'attached');

  useEffect(() => {
    if (finished) {
      router.refresh();
    }
  }, [finished, router]);

  async function pick(files: File[]) {
    if (target) {
      uploads.pick(files, target);
      return;
    }

    const opened = await openBuyerCounselUploads({ dealId });

    if (!opened.ok) {
      setRefusal(opened.refusal);
      return;
    }

    setTarget(opened.value);
    uploads.pick(files, opened.value);
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'font-medium'}>Your uploads</h2>
      <div className={'flex flex-wrap items-center gap-2'}>
        {folders.length > 0 ? (
          <select
            aria-label={'Upload into'}
            className={'rounded-md border px-2 py-1 text-sm'}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path}
              </option>
            ))}
          </select>
        ) : null}
        <AttachButton onPick={(files) => void pick(files)} multiple>
          Upload files
        </AttachButton>
        {folders.length > 0 ? (
          <Button
            type={'button'}
            variant={'outline'}
            size={'sm'}
            onClick={() => setIsNaming(true)}
          >
            New folder
          </Button>
        ) : null}
      </div>
      {refusal ? <RefusalNote refusal={refusal} /> : null}
      <UploadList
        queue={uploads.queue}
        queuedKeys={uploads.queuedKeys}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      {isNaming ? (
        <NewFolderDialog
          space={space}
          parentFolderId={target}
          onClose={() => setIsNaming(false)}
        />
      ) : null}
    </section>
  );
}

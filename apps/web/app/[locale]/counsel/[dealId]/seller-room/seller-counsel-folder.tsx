'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import {
  AttachButton,
  UploadList,
  useUploads,
} from '@odb/lender-rooms/requests-ui/uploads.tsx';
import { NewFolderDialog } from '@odb/lender-rooms/room-browser/new-folder-dialog.tsx';
import { Button } from '@odb/ui/button';

export interface SellerCounselFile {
  documentId: string;
  name: string;
}

export interface SellerCounselSubfolder {
  id: string;
  path: string;
}

export function SellerCounselFolder({
  dealId,
  folders,
  files,
  readOnly = false,
}: {
  dealId: string;
  folders: SellerCounselSubfolder[];
  files: SellerCounselFile[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const space = { sellerCounselDealId: dealId };
  const [target, setTarget] = useState(folders[0]!.id);
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

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Seller&apos;s counsel folder</h2>
      <p className={'text-muted-foreground text-sm'}>
        Only the seller and their counsel see this folder.
      </p>
      <ul className={'flex flex-col gap-1 text-sm'}>
        {files.map((file) => (
          <li key={file.documentId}>
            <a
              className={'underline'}
              href={`${counselPortalPath(dealId)}/seller-room/files/${file.documentId}?disposition=download`}
            >
              {file.name}
            </a>
          </li>
        ))}
      </ul>
      {readOnly ? null : (
        <>
          <div className={'flex flex-wrap items-center gap-2'}>
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
            <AttachButton
              onPick={(picked) => uploads.pick(picked, target)}
              multiple
            >
              Upload files
            </AttachButton>
            <Button
              type={'button'}
              variant={'outline'}
              size={'sm'}
              onClick={() => setIsNaming(true)}
            >
              New folder
            </Button>
          </div>
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
        </>
      )}
    </section>
  );
}

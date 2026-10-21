'use client';

import { type ReactNode, useState } from 'react';

import { XIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@odb/ui/dialog';

import { FileViewer } from '../viewer/file-viewer';
import { type FileSource, fileUrl } from './file-access';

export function FilePreviewDialog({
  documentId,
  fileName,
  onClose,
  children,
  ...source
}: FileSource & {
  documentId: string;
  fileName: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [opener] = useState(() => document.activeElement);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (opener instanceof HTMLElement) {
            event.preventDefault();
            opener.focus();
          }
        }}
        className={
          'flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[94dvh] sm:w-[min(96vw,84rem)] sm:max-w-none sm:rounded-lg sm:border'
        }
      >
        <DialogTitle className={'sr-only'}>Preview of {fileName}</DialogTitle>
        <div
          className={
            'bg-background flex shrink-0 items-center gap-3 border-b px-3 py-2'
          }
        >
          <div
            className={
              'flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1'
            }
          >
            {children}
          </div>
          <DialogClose asChild>
            <Button variant={'ghost'} size={'sm'}>
              <XIcon />
              Close
            </Button>
          </DialogClose>
        </div>
        <div className={'min-h-0 flex-1'}>
          <FileViewer
            fileName={fileName}
            previewUrl={fileUrl({
              ...source,
              documentId,
              disposition: 'preview',
            })}
            downloadUrl={fileUrl({
              ...source,
              documentId,
              disposition: 'download',
            })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

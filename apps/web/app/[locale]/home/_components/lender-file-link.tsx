'use client';

import { useState } from 'react';

import {
  type FileSource,
  fileUrl,
} from '@odb/lender-rooms/browser/file-access.ts';
import { FilePreviewDialog } from '@odb/lender-rooms/browser/file-preview-dialog.tsx';
import { cn } from '@odb/ui/utils';

export function LenderFileLink({
  source,
  documentId,
  fileName,
  label = fileName,
  downloadLabel,
  className,
}: {
  source: FileSource;
  documentId: string;
  fileName: string;
  label?: string;
  downloadLabel: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const download = (
    <a
      href={fileUrl({ ...source, documentId, disposition: 'download' })}
      aria-label={downloadLabel}
      className={
        'text-muted-foreground hover:text-foreground text-xs underline'
      }
    >
      Download
    </a>
  );

  return (
    <>
      <button
        type={'button'}
        className={cn(
          'focus-visible:ring-ring/50 min-w-0 truncate rounded-sm text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-[3px]',
          className,
        )}
        onClick={() => setIsOpen(true)}
      >
        {label}
      </button>
      {download}
      {isOpen ? (
        <FilePreviewDialog
          {...source}
          documentId={documentId}
          fileName={fileName}
          onClose={() => setIsOpen(false)}
        >
          <span className={'truncate text-sm font-medium'}>{label}</span>
        </FilePreviewDialog>
      ) : null}
    </>
  );
}

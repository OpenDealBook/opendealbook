'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import { cn } from '@odb/ui/utils';

import type { RoomFile, RoomFileVersion } from '../contents/listing';
import { LocalTime } from '../requests-ui/local-time';
import type { RoomSpace } from './file-access';
import { FilePreviewDialog } from './file-preview-dialog';

export function FileOverlay({
  space,
  file,
  shownDocumentId,
  previous,
  next,
  onShow,
  onShowVersion,
  onClose,
}: {
  space: RoomSpace;
  file: RoomFile;
  shownDocumentId: string;
  previous: RoomFile | null;
  next: RoomFile | null;
  onShow: (file: RoomFile) => void;
  onShowVersion: (version: RoomFileVersion) => void;
  onClose: () => void;
}) {
  const versions = [file, ...file.earlierVersions];
  return (
    <FilePreviewDialog
      {...space}
      documentId={shownDocumentId}
      fileName={file.name}
      onClose={onClose}
    >
      <div className={'flex items-center gap-1'}>
        <Button
          variant={'outline'}
          size={'sm'}
          disabled={!previous}
          onClick={() => previous && onShow(previous)}
        >
          <ChevronLeftIcon />
          <span className={'sr-only sm:not-sr-only'}>Previous file</span>
        </Button>
        <Button
          variant={'outline'}
          size={'sm'}
          disabled={!next}
          onClick={() => next && onShow(next)}
        >
          <span className={'sr-only sm:not-sr-only'}>Next file</span>
          <ChevronRightIcon />
        </Button>
      </div>

      {file.earlierVersions.length > 0 ? (
        <ul
          aria-label={'Versions'}
          className={'flex min-w-0 items-center gap-1 overflow-x-auto'}
        >
          {versions.map((version) => (
            <li key={version.documentId}>
              <button
                type={'button'}
                aria-current={version.documentId === shownDocumentId}
                onClick={() => onShowVersion(version)}
                className={cn(
                  'text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 rounded-md px-2 py-1 text-xs whitespace-nowrap outline-none focus-visible:ring-[3px]',
                  version.documentId === shownDocumentId &&
                    'bg-secondary text-secondary-foreground font-medium',
                )}
              >
                Version {version.version}
                {version.documentId === file.documentId ? ', latest' : null}
                <span className={'hidden lg:inline'}>
                  {', '}
                  <LocalTime at={version.createdAt} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </FilePreviewDialog>
  );
}

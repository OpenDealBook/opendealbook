'use client';

import { useState } from 'react';

import Link from 'next/link';

import { FileViewer } from '@odb/lender-rooms/viewer/file-viewer.tsx';
import { Button } from '@odb/ui/button';
import { cn } from '@odb/ui/utils';

interface WindowFile {
  id: string;
  name: string;
  version: number;
}

export interface WindowFolder {
  id: string;
  name: string;
  files: WindowFile[];
  folders: WindowFolder[];
}

function findFile(folders: WindowFolder[], id: string): WindowFile | undefined {
  for (const folder of folders) {
    const found =
      folder.files.find((file) => file.id === id) ??
      findFile(folder.folders, id);

    if (found) {
      return found;
    }
  }
}

function FolderTree({
  folders,
  viewHref,
  selectedId,
  onPick,
}: {
  folders: WindowFolder[];
  viewHref: string;
  selectedId: string | null;
  onPick: () => void;
}) {
  return (
    <ul className={'flex flex-col'}>
      {folders.map((folder) => (
        <li key={folder.id}>
          <details open className={'group'}>
            <summary
              className={
                'hover:bg-muted cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium'
              }
            >
              {folder.name}
            </summary>
            <div className={'border-border ml-3.5 border-l pl-2'}>
              <FolderTree
                folders={folder.folders}
                viewHref={viewHref}
                selectedId={selectedId}
                onPick={onPick}
              />
              <ul className={'flex flex-col'}>
                {folder.files.map((file) => (
                  <li key={file.id}>
                    <Link
                      href={`${viewHref}?doc=${file.id}`}
                      title={file.name}
                      onClick={onPick}
                      aria-current={file.id === selectedId ? 'page' : undefined}
                      className={
                        'hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary flex items-center gap-2 rounded-md px-2 py-1.5 text-sm'
                      }
                    >
                      <span className={'min-w-0 flex-1 truncate'}>
                        {file.name}
                      </span>
                      <span
                        className={'text-muted-foreground text-xs tabular-nums'}
                      >
                        v{file.version}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function DataRoomWindow({
  dealName,
  dealHref,
  viewHref,
  filesHref,
  folders,
  selectedId,
  initialPage,
  initialSheet,
}: {
  dealName: string;
  dealHref: string;
  viewHref: string;
  filesHref: string;
  folders: WindowFolder[];
  selectedId: string | null;
  initialPage?: number;
  initialSheet?: string;
}) {
  const selected =
    selectedId === null ? undefined : findFile(folders, selectedId);
  const [browsing, setBrowsing] = useState(selected === undefined);

  return (
    <div className={'flex h-dvh min-w-0 flex-col'}>
      <header
        className={'bg-background flex items-center gap-3 border-b px-4 py-2'}
      >
        <Link
          href={dealHref}
          className={'min-w-0 truncate text-sm font-semibold hover:underline'}
        >
          {dealName}
        </Link>
        <Button
          type={'button'}
          variant={'outline'}
          size={'sm'}
          className={'ml-auto lg:hidden'}
          aria-expanded={browsing}
          onClick={() => setBrowsing(!browsing)}
        >
          Files
        </Button>
      </header>
      <div className={'flex min-h-0 flex-1'}>
        <nav
          aria-label={'Data room files'}
          className={cn(
            browsing ? 'block' : 'hidden',
            'min-w-0 flex-1 overflow-y-auto p-2 lg:block lg:w-72 lg:flex-none lg:border-r',
          )}
        >
          {selectedId !== null && selected === undefined ? (
            <p role={'alert'} className={'p-2 text-sm font-medium'}>
              That file is no longer available.
            </p>
          ) : null}
          {folders.length === 0 ? (
            <p className={'text-muted-foreground p-2 text-sm'}>
              No folders in this data room yet
            </p>
          ) : (
            <FolderTree
              folders={folders}
              viewHref={viewHref}
              selectedId={selectedId}
              onPick={() => setBrowsing(false)}
            />
          )}
        </nav>
        <div
          className={cn(
            browsing ? 'hidden' : 'block',
            'min-w-0 flex-1 lg:block',
          )}
        >
          {selected === undefined ? (
            <p
              className={
                'text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm'
              }
            >
              Choose a file to view it here
            </p>
          ) : (
            <FileViewer
              fileName={selected.name}
              previewUrl={`${filesHref}/${selected.id}?disposition=preview`}
              downloadUrl={`${filesHref}/${selected.id}?disposition=download`}
              initialPage={initialPage}
              initialSheet={initialSheet}
            />
          )}
        </div>
      </div>
    </div>
  );
}

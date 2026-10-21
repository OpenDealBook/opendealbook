'use client';

import type { KeyboardEvent, MouseEvent } from 'react';

import {
  DownloadIcon,
  EyeIcon,
  FolderIcon,
  MessageCircleQuestionIcon,
  MoreVerticalIcon,
} from 'lucide-react';

import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { cn } from '@odb/ui/utils';

import type {
  OversizeFile,
  RoomEntry,
  RoomFile,
  RoomFolder,
} from '../contents/listing';
import { LocalTime } from '../requests-ui/local-time';
import { fileSize, fileUrl, type RoomSpace } from './file-access';
import { newFileCount } from './room-places';
import { TypeIcon } from './type-icon';
import type { RoomView } from './view-preference';

interface EntryActions {
  space: RoomSpace;
  selected: ReadonlySet<string>;
  selectedFolders: ReadonlySet<string>;
  locationOf: ((entry: RoomEntry) => string) | null;
  onOpenFolder: (folderId: string) => void;
  onOpenFile: (file: RoomFile) => void;
  onRequestAbout: ((file: RoomFile) => void) | null;
  onToggle: (documentId: string, extendsRange: boolean) => void;
  onToggleFolder: (folderId: string) => void;
  onExtendTo: (documentId: string) => void;
}

export const focusRing =
  'outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

function moveFocusOrExtendSelection(
  event: KeyboardEvent<HTMLElement>,
  actions: EntryActions,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }

  const neighbour =
    event.key === 'ArrowDown'
      ? event.currentTarget.nextElementSibling
      : event.currentTarget.previousElementSibling;

  if (!(neighbour instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  neighbour.focus();

  if (event.shiftKey && neighbour.dataset.fileId) {
    actions.onExtendTo(neighbour.dataset.fileId);
  }
}

function fileKeys(
  event: KeyboardEvent<HTMLElement>,
  file: RoomFile,
  actions: EntryActions,
) {
  if (event.target === event.currentTarget && event.key === ' ') {
    event.preventDefault();
    actions.onToggle(file.documentId, false);
    return;
  }

  if (event.target === event.currentTarget && event.key === 'Enter') {
    actions.onOpenFile(file);
    return;
  }

  moveFocusOrExtendSelection(event, actions);
}

function NewMark() {
  return (
    <span
      className={
        'text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium'
      }
    >
      <span aria-hidden className={'bg-primary size-1.5 rounded-full'} />
      New
    </span>
  );
}

export function NewCount({ folder }: { folder: RoomFolder }) {
  const count = newFileCount(folder);

  return count === 0 ? null : (
    <span className={'text-primary shrink-0 text-xs font-medium'}>
      {count} new
    </span>
  );
}

function SelectBox({
  file,
  actions,
}: {
  file: RoomFile;
  actions: EntryActions;
}) {
  return (
    <Checkbox
      aria-label={`Select ${file.name}`}
      checked={actions.selected.has(file.documentId)}
      onClick={(event: MouseEvent) =>
        actions.onToggle(file.documentId, event.shiftKey)
      }
    />
  );
}

function downloadHref(file: RoomFile, actions: EntryActions): string {
  return fileUrl({
    ...actions.space,
    documentId: file.documentId,
    disposition: 'download',
  });
}

function FolderSelectBox({
  folder,
  actions,
}: {
  folder: RoomFolder;
  actions: EntryActions;
}) {
  return (
    <Checkbox
      aria-label={`Select folder ${folder.name}`}
      checked={actions.selectedFolders.has(folder.id)}
      onClick={() => actions.onToggleFolder(folder.id)}
    />
  );
}

function FileMenu({
  file,
  actions,
}: {
  file: RoomFile;
  actions: EntryActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={'ghost'}
          size={'icon'}
          className={'size-8'}
          aria-label={`Actions for ${file.name}`}
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={'end'}>
        <DropdownMenuItem onSelect={() => actions.onOpenFile(file)}>
          <EyeIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadHref(file, actions)}>
            <DownloadIcon />
            Download
          </a>
        </DropdownMenuItem>
        {actions.onRequestAbout ? (
          <DropdownMenuItem onSelect={() => actions.onRequestAbout?.(file)}>
            <MessageCircleQuestionIcon />
            Request something about this file
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DownloadLink({
  file,
  actions,
}: {
  file: RoomFile;
  actions: EntryActions;
}) {
  return (
    <Button asChild variant={'ghost'} size={'icon'} className={'size-8'}>
      <a
        href={downloadHref(file, actions)}
        aria-label={`Download ${file.name}`}
      >
        <DownloadIcon />
      </a>
    </Button>
  );
}

function versionNote(file: RoomFile): string | null {
  return file.earlierVersions.length === 0
    ? null
    : `${file.earlierVersions.length + 1} versions`;
}

function oversizeNote(entry: OversizeFile): string {
  return `${fileSize(entry.sizeBytes)}. Too large to add`;
}

const listColumns =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_4rem_11rem_4.5rem]';

function ListView({
  folders,
  entries,
  actions,
}: {
  folders: RoomFolder[];
  entries: RoomEntry[];
  actions: EntryActions;
}) {
  return (
    <div className={'rounded-lg border'}>
      <div
        aria-hidden
        data-columns
        className={cn(
          listColumns,
          'text-muted-foreground hidden border-b py-2 text-xs sm:grid',
        )}
      >
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Added</span>
        <span />
      </div>
      <ul className={'divide-y'}>
        {folders.map((folder) => (
          <li
            key={folder.id}
            data-folder-id={folder.id}
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                event.key === 'Enter'
              ) {
                actions.onOpenFolder(folder.id);
                return;
              }

              moveFocusOrExtendSelection(event, actions);
            }}
            className={cn(
              listColumns,
              focusRing,
              'hover:bg-accent/60 py-2',
              actions.selectedFolders.has(folder.id) && 'bg-secondary',
            )}
          >
            <FolderSelectBox folder={folder} actions={actions} />
            <span className={'flex min-w-0 items-center gap-2'}>
              <FolderIcon
                aria-hidden
                className={'text-brass size-5 shrink-0 fill-current/15'}
              />
              <button
                type={'button'}
                onClick={() => actions.onOpenFolder(folder.id)}
                className={cn(
                  focusRing,
                  'min-w-0 truncate rounded-sm text-left text-sm font-medium hover:underline',
                )}
              >
                {folder.name}
              </button>
              <NewCount folder={folder} />
            </span>
            <span className={'text-muted-foreground hidden text-xs sm:block'}>
              Folder
            </span>
            <span className={'hidden sm:block'} />
            <span />
          </li>
        ))}
        {entries.map((entry) =>
          entry.kind === 'oversize' ? (
            <li
              key={entry.id}
              tabIndex={0}
              aria-disabled
              onKeyDown={(event) => moveFocusOrExtendSelection(event, actions)}
              className={cn(
                listColumns,
                focusRing,
                'text-muted-foreground bg-muted/40 py-2',
              )}
            >
              <span />
              <span className={'flex min-w-0 items-center gap-2.5'}>
                <TypeIcon type={entry.type} className={'size-5 shrink-0'} />
                <span className={'flex min-w-0 flex-col'}>
                  <span className={'truncate text-sm'}>{entry.name}</span>
                  <span className={'text-xs'}>{oversizeNote(entry)}</span>
                </span>
              </span>
              <span className={'hidden text-xs sm:block'}>{entry.type}</span>
              <span className={'hidden text-xs sm:block'}>
                <LocalTime at={entry.createdAt} />
              </span>
              <span />
            </li>
          ) : (
            <li
              key={entry.documentId}
              data-file-id={entry.documentId}
              tabIndex={0}
              onKeyDown={(event) => fileKeys(event, entry, actions)}
              className={cn(
                listColumns,
                focusRing,
                'hover:bg-accent/60 py-1.5',
                actions.selected.has(entry.documentId) && 'bg-secondary',
              )}
            >
              <SelectBox file={entry} actions={actions} />
              <span className={'flex min-w-0 items-center gap-2.5'}>
                <TypeIcon
                  type={entry.type}
                  className={'text-muted-foreground size-5 shrink-0'}
                />
                <span className={'flex min-w-0 flex-col'}>
                  <span className={'flex min-w-0 items-center gap-2'}>
                    <button
                      type={'button'}
                      onClick={() => actions.onOpenFile(entry)}
                      className={cn(
                        focusRing,
                        'line-clamp-2 min-w-0 rounded-sm text-left text-sm font-medium break-words hover:underline sm:line-clamp-1',
                      )}
                    >
                      {entry.name}
                    </button>
                    {entry.visitMark === 'new' ? <NewMark /> : null}
                  </span>
                  <span
                    className={
                      'text-muted-foreground flex flex-wrap gap-x-2 text-xs empty:hidden'
                    }
                  >
                    {actions.locationOf ? (
                      <span>{actions.locationOf(entry)}</span>
                    ) : null}
                    {versionNote(entry) ? (
                      <span>{versionNote(entry)}</span>
                    ) : null}
                    <span className={'sm:hidden'}>
                      <LocalTime at={entry.createdAt} />
                    </span>
                  </span>
                </span>
              </span>
              <span className={'text-muted-foreground hidden text-xs sm:block'}>
                {entry.type}
              </span>
              <span className={'text-muted-foreground hidden text-xs sm:block'}>
                <LocalTime at={entry.createdAt} />
              </span>
              <span className={'flex justify-end'}>
                <span className={'hidden sm:block'}>
                  <DownloadLink file={entry} actions={actions} />
                </span>
                <FileMenu file={entry} actions={actions} />
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

const card = 'flex min-w-0 flex-col gap-3 rounded-lg border p-3';

function GridView({
  folders,
  entries,
  actions,
}: {
  folders: RoomFolder[];
  entries: RoomEntry[];
  actions: EntryActions;
}) {
  return (
    <ul className={'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'}>
      {folders.map((folder) => (
        <li
          key={folder.id}
          data-folder-id={folder.id}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && event.key === 'Enter') {
              actions.onOpenFolder(folder.id);
              return;
            }

            moveFocusOrExtendSelection(event, actions);
          }}
          className={cn(
            card,
            focusRing,
            'hover:bg-accent/60',
            actions.selectedFolders.has(folder.id) &&
              'border-primary/50 bg-secondary',
          )}
        >
          <span className={'flex items-start justify-between'}>
            <FolderIcon
              aria-hidden
              className={'text-brass size-9 fill-current/15 stroke-[1.25]'}
            />
            <FolderSelectBox folder={folder} actions={actions} />
          </span>
          <span className={'flex min-w-0 flex-col gap-0.5'}>
            <button
              type={'button'}
              onClick={() => actions.onOpenFolder(folder.id)}
              className={cn(
                focusRing,
                'truncate rounded-sm text-left text-sm font-medium hover:underline',
              )}
            >
              {folder.name}
            </button>
            <NewCount folder={folder} />
          </span>
        </li>
      ))}
      {entries.map((entry) =>
        entry.kind === 'oversize' ? (
          <li
            key={entry.id}
            tabIndex={0}
            aria-disabled
            onKeyDown={(event) => moveFocusOrExtendSelection(event, actions)}
            className={cn(card, focusRing, 'text-muted-foreground bg-muted/40')}
          >
            <TypeIcon type={entry.type} className={'size-9 stroke-[1.25]'} />
            <span className={'flex min-w-0 flex-col gap-0.5'}>
              <span className={'truncate text-sm'}>{entry.name}</span>
              <span className={'text-xs'}>{oversizeNote(entry)}</span>
            </span>
          </li>
        ) : (
          <li
            key={entry.documentId}
            data-file-id={entry.documentId}
            tabIndex={0}
            onKeyDown={(event) => fileKeys(event, entry, actions)}
            className={cn(
              card,
              focusRing,
              'hover:bg-accent/60',
              actions.selected.has(entry.documentId) &&
                'border-primary/50 bg-secondary',
            )}
          >
            <span className={'flex items-start justify-between'}>
              <TypeIcon
                type={entry.type}
                className={'text-muted-foreground size-9 stroke-[1.25]'}
              />
              <span className={'flex items-center gap-1'}>
                <FileMenu file={entry} actions={actions} />
                <SelectBox file={entry} actions={actions} />
              </span>
            </span>
            <span className={'flex min-w-0 flex-col gap-0.5'}>
              <button
                type={'button'}
                onClick={() => actions.onOpenFile(entry)}
                className={cn(
                  focusRing,
                  'truncate rounded-sm text-left text-sm font-medium hover:underline',
                )}
              >
                {entry.name}
              </button>
              <span
                className={
                  'text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs'
                }
              >
                {entry.visitMark === 'new' ? <NewMark /> : null}
                <span>{entry.type}</span>
                {versionNote(entry) ? <span>{versionNote(entry)}</span> : null}
              </span>
              {actions.locationOf ? (
                <span className={'text-muted-foreground truncate text-xs'}>
                  {actions.locationOf(entry)}
                </span>
              ) : null}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

export function EntryView({
  view,
  ...listing
}: {
  view: RoomView;
  folders: RoomFolder[];
  entries: RoomEntry[];
  actions: EntryActions;
}) {
  return view === 'grid' ? (
    <GridView {...listing} />
  ) : (
    <ListView {...listing} />
  );
}

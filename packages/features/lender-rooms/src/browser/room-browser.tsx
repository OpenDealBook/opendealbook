'use client';

import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  ChevronRightIcon,
  DownloadIcon,
  FileArchiveIcon,
  FolderIcon,
  FolderLockIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { cn } from '@odb/ui/utils';

import { recordFolderOpened, recordRoomOpened } from '../activity/actions';
import {
  type RoomEntry,
  type RoomFile,
  type RoomFolder,
  type RoomSort,
  sortRoomEntries,
} from '../contents/listing';
import { AskComposer } from '../requests-ui/ask-composer';
import { useUnsentWork } from '../requests-ui/discard';
import { RefusalNote } from '../requests-ui/refusal-note';
import {
  attachedDocumentIds,
  heldUploads,
  isAnyUploadInProgress,
} from '../requests-ui/upload-queue';
import { AttachButton, UploadList, useUploads } from '../requests-ui/uploads';
import { teamName } from '../requests-ui/wording';
import { EntryView, focusRing, NewCount } from './entry-views';
import { neighbours, zipDownloadForm } from './file-access';
import { FileOverlay } from './file-overlay';
import type { DroppedItem } from './folder-drop';
import { NewFolderDialog } from './new-folder-dialog';
import {
  entriesUnder,
  filesUnder,
  findFolder,
  newFileCount,
  type Place,
  type RoomPlaces,
  uploadDestination,
} from './room-places';
import { selectionRange, selectionSummary, zipSelection } from './selection';
import { useFolderDrop } from './use-folder-drop';
import { useUnfinishedUploads } from './use-unfinished-uploads';
import { useRoomSort, useRoomView } from './view-preference';

const OWN_SPACE = 'Your files';

const sortLabels = {
  name: 'Name',
  date: 'Date',
  type: 'Type',
} satisfies Record<RoomSort, string>;

function ZipForm({
  roomId,
  documentIds,
  variant,
  children,
}: {
  roomId: string;
  documentIds: string[];
  variant: 'default' | 'outline';
  children: string;
}) {
  const form = zipDownloadForm(roomId, documentIds);

  return (
    <form method={'post'} action={form.action}>
      {form.fields.map((field) => (
        <input
          key={field.value}
          type={'hidden'}
          name={field.name}
          value={field.value}
        />
      ))}
      <Button
        type={'submit'}
        size={'sm'}
        variant={variant}
        disabled={documentIds.length === 0}
      >
        <DownloadIcon />
        {children}
      </Button>
    </form>
  );
}

const treeFolderIcon = (
  <FolderIcon aria-hidden className={'text-brass size-4 shrink-0'} />
);

const placeIcons = {
  shared: <LibraryIcon aria-hidden className={'size-4 shrink-0'} />,
  own: <FolderLockIcon aria-hidden className={'size-4 shrink-0'} />,
} satisfies Record<Place, ReactNode>;

function TreeFolder({
  folder,
  label,
  icon,
  depth,
  currentId,
  onOpen,
}: {
  folder: RoomFolder;
  label: string;
  icon: ReactNode;
  depth: number;
  currentId: string;
  onOpen: (folderId: string) => void;
}) {
  return (
    <li>
      <button
        type={'button'}
        aria-current={folder.id === currentId ? 'page' : undefined}
        onClick={() => onOpen(folder.id)}
        style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
        className={cn(
          focusRing,
          'hover:bg-accent flex w-full items-start gap-2 rounded-md py-1.5 pr-2 text-left text-sm [&>svg]:mt-0.5',
          depth === 0 && 'font-medium',
          folder.id === currentId && 'bg-secondary text-secondary-foreground',
        )}
      >
        {icon}
        <span className={cn('min-w-0 flex-1', depth > 0 && 'truncate')}>
          {label}
        </span>
        <NewCount folder={folder} />
      </button>
      {folder.folders.length === 0 ? null : (
        <ul>
          {folder.folders.map((child) => (
            <TreeFolder
              key={child.id}
              folder={child}
              label={child.name}
              icon={treeFolderIcon}
              depth={depth + 1}
              currentId={currentId}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function EmptyState({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <div
      data-empty
      className={
        'text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center text-sm'
      }
    >
      <p>{message}</p>
      {children}
    </div>
  );
}

export function RoomBrowser({
  roomId,
  userId,
  places,
  packageLabel,
  dealName,
}: {
  roomId: string;
  userId: string;
  places: RoomPlaces;
  packageLabel: string;
  dealName: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useRoomView(`${roomId}/${userId}`);
  const [sort, setSort] = useRoomSort(`${roomId}/${userId}`);
  const [folderId, setFolderId] = useState(places.shared.id);
  const [query, setQuery] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [anchor, setAnchor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    fileId: string;
    shownDocumentId: string;
  } | null>(null);
  const [requestAbout, setRequestAbout] = useState<RoomFile | null>(null);
  const [dropAwaitingConsent, setDropAwaitingConsent] = useState<
    DroppedItem[] | null
  >(null);
  const [isNamingFolder, setIsNamingFolder] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [zipsKeptAsOneFile, setZipsKeptAsOneFile] = useState<
    ReadonlySet<string>
  >(new Set());
  const [recordingRefusal, setRecordingRefusal] = useState<string | null>(
    null,
  );
  const [folderTreesCreated, setFolderTreesCreated] = useState(0);

  const placeLabels = {
    shared: packageLabel,
    own: OWN_SPACE,
  } satisfies Record<Place, string>;

  const location = findFolder(places, folderId) ?? {
    place: 'shared' as const,
    folder: places.shared,
    path: [places.shared],
  };
  const destination = uploadDestination({
    place: location.place,
    currentFolderId: location.folder.id,
    ownFolderId: places.own.id,
  });

  const uploads = useUploads({ space: { roomId }, folderId: places.own.id });
  const unfinished = useUnfinishedUploads({
    roomId,
    userId,
    uploads,
    ownFolderId: places.own.id,
    folderExists: (id) => findFolder(places, id)?.place === 'own',
  });
  const isUploading = isAnyUploadInProgress(uploads.queue);

  useUnsentWork(isUploading);

  const folderDrop = useFolderDrop({
    space: { roomId },
    startUploads: (files, into) => void unfinished.upload(files, into),
    onFoldersCreated: (count) => setFolderTreesCreated((made) => made + count),
  });

  function offerOrAdd(items: DroppedItem[]) {
    if (destination.offersOwnSpace) {
      setDropAwaitingConsent(items);
    } else {
      void folderDrop.addDropped(items, destination.folderId);
    }
  }

  function addFiles(files: File[]) {
    offerOrAdd(
      files.map((file) => ({ rootName: file.name, beneath: [], file })),
    );
  }

  function dropItems(event: DragEvent) {
    setIsDraggedOver(false);
    void folderDrop.readDrop(event).then((items) => items && offerOrAdd(items));
  }

  const zipsAwaitingChoice = heldUploads(uploads.queue);
  const keysAwaitingChoice = new Set(zipsAwaitingChoice.map((zip) => zip.key));

  function chooseForZip(key: string, keepsAsOneFile: boolean) {
    const next = new Set(zipsKeptAsOneFile);

    if (keepsAsOneFile) {
      next.add(key);
    } else {
      next.delete(key);
    }

    setZipsKeptAsOneFile(next);
  }

  const listingChanges =
    attachedDocumentIds(uploads.queue).length + folderTreesCreated;

  useEffect(() => {
    if (!isUploading && listingChanges > 0) {
      router.refresh();
    }
  }, [isUploading, listingChanges, router]);

  const roomOpenRecorded = useRef(false);

  useEffect(() => {
    if (roomOpenRecorded.current) {
      return;
    }

    roomOpenRecorded.current = true;

    void recordRoomOpened({ roomId }).then((result) => {
      if (!result.ok) {
        setRecordingRefusal(result.refusal);
      }
    });
  }, [roomId]);

  const everyEntry = [
    ...entriesUnder(places.shared),
    ...entriesUnder(places.own),
  ];
  const needle = query.trim();
  const isAcrossRoom = needle !== '' || newOnly;
  const folders = isAcrossRoom ? [] : location.folder.folders;
  const entries = sortRoomEntries(
    isAcrossRoom
      ? everyEntry.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle.toLowerCase()) &&
            (!newOnly || (entry.kind === 'file' && entry.visitMark === 'new')),
        )
      : location.folder.entries,
    sort,
  );
  const fileIds = entries.flatMap((entry) =>
    entry.kind === 'file' ? [entry.documentId] : [],
  );
  const selectedFileIds = fileIds.filter((id) => selected.has(id));
  const foldersSelected = folders.filter((folder) =>
    selectedFolders.has(folder.id),
  );
  const totalNew = newFileCount(places.shared) + newFileCount(places.own);

  function clearSelection() {
    setSelected(new Set());
    setSelectedFolders(new Set());
    setAnchor(null);
  }

  function openFolder(id: string) {
    setFolderId(id);
    setQuery('');
    setNewOnly(false);
    clearSelection();

    void recordFolderOpened({ roomId, folderId: id }).then((result) => {
      setRecordingRefusal(result.ok ? null : result.refusal);
    });
  }

  function toggle(documentId: string, extendsRange: boolean) {
    if (extendsRange && anchor) {
      setSelected(
        new Set([
          ...selected,
          ...selectionRange(fileIds, anchor, documentId),
        ]),
      );
      return;
    }

    const next = new Set(selected);

    if (!next.delete(documentId)) {
      next.add(documentId);
    }

    setSelected(next);
    setAnchor(documentId);
  }

  function toggleFolder(id: string) {
    const next = new Set(selectedFolders);

    if (!next.delete(id)) {
      next.add(id);
    }

    setSelectedFolders(next);
  }

  function extendTo(documentId: string) {
    const from = anchor ?? documentId;

    setAnchor(from);
    setSelected(new Set(selectionRange(fileIds, from, documentId)));
  }

  function locationOf(entry: RoomEntry): string {
    const found = findFolder(places, entry.folderId);

    return found
      ? [
          placeLabels[found.place],
          ...found.path.slice(1).map((folder) => folder.name),
        ].join(' / ')
      : '';
  }

  const viewedFile = viewing
    ? entries.find(
        (entry): entry is RoomFile =>
          entry.kind === 'file' && entry.documentId === viewing.fileId,
      )
    : undefined;

  const emptyMessage = needle
    ? `No files named "${needle}" in this room`
    : newOnly
      ? 'Nothing new since your last visit'
      : location.place === 'own'
        ? 'Drop your forms or files here'
        : `Documents will appear here as ${teamName(dealName)} adds them`;

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setIsDraggedOver(true);
      }}
      onDragLeave={() => setIsDraggedOver(false)}
      onDrop={dropItems}
      data-drop-zone
      aria-label={'Files'}
      className={'flex flex-col gap-4'}
    >
      <div className={'flex flex-wrap items-center gap-2'}>
        <div className={'relative basis-full sm:basis-48 sm:flex-1'}>
          <SearchIcon
            aria-hidden
            className={
              'text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            }
          />
          <Input
            type={'search'}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              clearSelection();
            }}
            aria-label={'Search files in this room'}
            placeholder={'Search files in this room'}
            className={'pl-9'}
          />
        </div>
        <AttachButton onPick={addFiles} multiple>
          Add files
        </AttachButton>
        {location.place === 'own' ? (
          <Button
            variant={'ghost'}
            size={'sm'}
            onClick={() => setIsNamingFolder(true)}
          >
            <FolderPlusIcon />
            New folder
          </Button>
        ) : null}
        <AskComposer
          roomId={roomId}
          privateFolderId={places.own.id}
          dealName={dealName}
          trigger={
            <Button>
              <MessageCircleQuestionIcon />
              Request something
            </Button>
          }
        />
      </div>

      {recordingRefusal || folderDrop.problems.length > 0 ? (
        <ul className={'flex flex-col gap-1'}>
          {recordingRefusal ? (
            <li>
              <RefusalNote refusal={recordingRefusal} />
            </li>
          ) : null}
          {folderDrop.problems.map((problem) => (
            <li key={problem.id} className={'flex items-start gap-2'}>
              <RefusalNote refusal={problem.text} />
              <Button
                variant={'ghost'}
                size={'icon'}
                className={'size-7 shrink-0'}
                aria-label={`Dismiss: ${problem.text}`}
                onClick={() => folderDrop.dismissProblem(problem.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {unfinished.movedToYourFiles ? (
        <p role={'status'} className={'text-muted-foreground text-sm'}>
          Some files went to {OWN_SPACE} because their folder is gone
        </p>
      ) : null}

      <div className={'grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]'}>
        <nav aria-label={'Folders'} className={'hidden lg:block'}>
          <ul className={'flex flex-col gap-4'}>
            <TreeFolder
              folder={places.shared}
              label={placeLabels.shared}
              icon={placeIcons.shared}
              depth={0}
              currentId={location.folder.id}
              onOpen={openFolder}
            />
            <TreeFolder
              folder={places.own}
              label={placeLabels.own}
              icon={placeIcons.own}
              depth={0}
              currentId={location.folder.id}
              onOpen={openFolder}
            />
          </ul>
        </nav>

        <div className={'flex min-w-0 flex-col gap-3'}>
          <div className={'grid grid-cols-2 gap-2 lg:hidden'}>
            {(['shared', 'own'] as const).map((place) => (
              <button
                key={place}
                type={'button'}
                aria-pressed={location.place === place}
                onClick={() => openFolder(places[place].id)}
                className={cn(
                  focusRing,
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium [&>svg]:mt-0.5',
                  location.place === place &&
                    'border-primary/40 bg-secondary text-secondary-foreground',
                )}
              >
                {placeIcons[place]}
                <span className={'min-w-0'}>{placeLabels[place]}</span>
              </button>
            ))}
          </div>

          <div className={'flex flex-wrap items-center gap-x-3 gap-y-2'}>
            <nav aria-label={'Breadcrumb'} className={'min-w-0 flex-1'}>
              <ol className={'flex flex-wrap items-center gap-1'}>
                {location.path.map((step, index) => (
                  <li key={step.id} className={'flex items-center gap-1'}>
                    {index === 0 ? null : (
                      <ChevronRightIcon
                        aria-hidden
                        className={'text-muted-foreground size-4'}
                      />
                    )}
                    {step.id === location.folder.id && !isAcrossRoom ? (
                      <span
                        aria-current={'page'}
                        className={'font-serif text-xl font-medium'}
                      >
                        {index === 0 ? placeLabels[location.place] : step.name}
                      </span>
                    ) : (
                      <button
                        type={'button'}
                        onClick={() => openFolder(step.id)}
                        className={cn(
                          focusRing,
                          'text-muted-foreground hover:text-foreground rounded-sm font-serif text-xl hover:underline',
                        )}
                      >
                        {index === 0 ? placeLabels[location.place] : step.name}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <div className={'flex flex-wrap items-center gap-2'}>
              <Button
                variant={'outline'}
                size={'sm'}
                aria-pressed={newOnly}
                onClick={() => {
                  setNewOnly(!newOnly);
                  clearSelection();
                }}
                className={cn(
                  newOnly && 'border-primary/50 bg-secondary text-primary',
                )}
              >
                <span
                  aria-hidden
                  className={'bg-primary size-1.5 rounded-full'}
                />
                New
                <span className={'text-muted-foreground font-normal'}>
                  {totalNew}
                </span>
              </Button>
              <Select
                value={sort}
                onValueChange={(next: RoomSort) => setSort(next)}
              >
                <SelectTrigger size={'sm'} aria-label={'Sort by'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['name', 'date', 'type'] as const).map((by) => (
                    <SelectItem key={by} value={by}>
                      {sortLabels[by]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className={'flex rounded-md border p-0.5'}>
                <Button
                  variant={'ghost'}
                  size={'icon'}
                  aria-label={'List view'}
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  className={cn('size-7', view === 'list' && 'bg-secondary')}
                >
                  <ListIcon />
                </Button>
                <Button
                  variant={'ghost'}
                  size={'icon'}
                  aria-label={'Grid view'}
                  aria-pressed={view === 'grid'}
                  onClick={() => setView('grid')}
                  className={cn('size-7', view === 'grid' && 'bg-secondary')}
                >
                  <LayoutGridIcon />
                </Button>
              </div>
              {isAcrossRoom ? null : (
                <ZipForm
                  roomId={roomId}
                  documentIds={filesUnder(location.folder).map(
                    (file) => file.documentId,
                  )}
                  variant={'outline'}
                >
                  Download all
                </ZipForm>
              )}
            </div>
          </div>

          {isAcrossRoom ? (
            <p className={'text-muted-foreground text-sm'}>
              {needle
                ? `Files named "${needle}" anywhere in this room`
                : 'New since your last visit, anywhere in this room'}
            </p>
          ) : null}

          <UploadList
            queue={uploads.queue.filter(
              (each) => !keysAwaitingChoice.has(each.key),
            )}
            queuedKeys={uploads.queuedKeys}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
            finishedWording={'Added'}
          />
          {zipsAwaitingChoice.map((zip) => (
            <fieldset
              key={zip.key}
              className={
                'bg-muted/60 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md py-1.5 pr-1.5 pl-3 text-sm'
              }
            >
              <legend className={'sr-only'}>How to add {zip.name}</legend>
              <span className={'flex min-w-0 basis-full items-center gap-2 sm:basis-auto sm:flex-1'}>
                <FileArchiveIcon
                  aria-hidden
                  className={'text-muted-foreground size-4 shrink-0'}
                />
                <span className={'truncate font-medium'}>{zip.name}</span>
              </span>
              <label className={'flex cursor-pointer items-center gap-2'}>
                <input
                  type={'radio'}
                  name={`zip-${zip.key}`}
                  className={'accent-primary size-4'}
                  checked={!zipsKeptAsOneFile.has(zip.key)}
                  onChange={() => chooseForZip(zip.key, false)}
                />
                Unpack into a folder
              </label>
              <label className={'flex cursor-pointer items-center gap-2'}>
                <input
                  type={'radio'}
                  name={`zip-${zip.key}`}
                  className={'accent-primary size-4'}
                  checked={zipsKeptAsOneFile.has(zip.key)}
                  onChange={() => chooseForZip(zip.key, true)}
                />
                Keep as one file
              </label>
              <span className={'ml-auto flex items-center gap-1'}>
                <Button
                  size={'sm'}
                  onClick={() =>
                    uploads.registerHeldUpload(
                      zip.key,
                      zipsKeptAsOneFile.has(zip.key),
                    )
                  }
                >
                  Add
                </Button>
                <Button
                  variant={'ghost'}
                  size={'icon'}
                  className={'size-8'}
                  aria-label={`Remove ${zip.name}`}
                  onClick={() => uploads.remove(zip.key)}
                >
                  <XIcon />
                </Button>
              </span>
            </fieldset>
          ))}

          <div
            className={cn(
              'rounded-lg',
              isDraggedOver &&
                'ring-primary/50 bg-secondary/60 ring-2 ring-offset-4',
            )}
          >
            {isDraggedOver ? (
              <p
                data-drop-hint
                className={'text-primary pb-2 text-sm font-medium'}
              >
                Drop to add to{' '}
                {destination.offersOwnSpace || location.path.length === 1
                  ? OWN_SPACE
                  : location.folder.name}
              </p>
            ) : null}
            {folders.length + entries.length === 0 ? (
              <EmptyState message={emptyMessage}>
                {location.place === 'own' && !isAcrossRoom ? (
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    onClick={() => setIsNamingFolder(true)}
                  >
                    <FolderPlusIcon />
                    New folder
                  </Button>
                ) : null}
              </EmptyState>
            ) : (
              <EntryView
                view={view}
                folders={folders}
                entries={entries}
                actions={{
                  roomId,
                  selected,
                  selectedFolders,
                  locationOf: isAcrossRoom ? locationOf : null,
                  onOpenFolder: openFolder,
                  onOpenFile: (file) =>
                    setViewing({
                      fileId: file.documentId,
                      shownDocumentId: file.documentId,
                    }),
                  onRequestAbout: setRequestAbout,
                  onToggle: toggle,
                  onToggleFolder: toggleFolder,
                  onExtendTo: extendTo,
                }}
              />
            )}
          </div>

          {selectedFileIds.length + foldersSelected.length === 0 ? null : (
            <div
              className={
                'bg-background sticky bottom-4 flex items-center gap-2 rounded-lg border py-2 pr-2 pl-4 shadow-md'
              }
            >
              <span
                data-selection
                className={'flex-1 text-sm font-medium whitespace-nowrap'}
              >
                {selectionSummary({
                  files: selectedFileIds.length,
                  folders: foldersSelected.length,
                })}
              </span>
              <Button variant={'ghost'} size={'sm'} onClick={clearSelection}>
                Clear
              </Button>
              <ZipForm
                roomId={roomId}
                documentIds={zipSelection(selectedFileIds, foldersSelected)}
                variant={'default'}
              >
                Download selected
              </ZipForm>
            </div>
          )}
        </div>
      </div>

      {viewing && viewedFile ? (
        <FileOverlay
          roomId={roomId}
          file={viewedFile}
          shownDocumentId={viewing.shownDocumentId}
          {...neighbours(entries, viewedFile.documentId)}
          onShow={(file) =>
            setViewing({
              fileId: file.documentId,
              shownDocumentId: file.documentId,
            })
          }
          onShowVersion={(version) =>
            setViewing({
              fileId: viewedFile.documentId,
              shownDocumentId: version.documentId,
            })
          }
          onClose={() => setViewing(null)}
        />
      ) : null}

      <AskComposer
        roomId={roomId}
        privateFolderId={places.own.id}
        dealName={dealName}
        aboutDocument={
          requestAbout
            ? { id: requestAbout.documentId, name: requestAbout.name }
            : undefined
        }
        open={requestAbout !== null}
        onOpenChange={() => {
          const row = document.querySelector<HTMLElement>(
            `[data-file-id="${requestAbout?.documentId}"]`,
          );

          setRequestAbout(null);
          requestAnimationFrame(() => row?.focus());
        }}
      />

      <Dialog open={unfinished.prompt !== null} onOpenChange={unfinished.dismiss}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Uploads that did not finish</DialogTitle>
            <DialogDescription>
              {unfinished.prompt?.question ?? unfinished.prompt?.lost}
            </DialogDescription>
          </DialogHeader>
          {unfinished.prompt?.question && unfinished.prompt.lost ? (
            <p className={'text-sm'}>{unfinished.prompt.lost}</p>
          ) : null}
          <DialogFooter>
            {unfinished.prompt?.question ? (
              <>
                <Button variant={'outline'} onClick={unfinished.discard}>
                  Discard
                </Button>
                <Button onClick={() => void unfinished.continueUploads()}>
                  Continue
                </Button>
              </>
            ) : (
              <Button onClick={unfinished.discard}>OK</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isNamingFolder ? (
        <NewFolderDialog
          space={{ roomId }}
          parentFolderId={location.folder.id}
          onClose={() => setIsNamingFolder(false)}
        />
      ) : null}

      <Dialog
        open={dropAwaitingConsent !== null}
        onOpenChange={() => setDropAwaitingConsent(null)}
      >
        {dropAwaitingConsent ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add these to {OWN_SPACE}?</DialogTitle>
              <DialogDescription>
                Only {teamName(dealName)} can add to {packageLabel}.{' '}
                {[
                  ...new Set(dropAwaitingConsent.map((item) => item.rootName)),
                ].join(', ')}{' '}
                will go to{' '}
                {OWN_SPACE}, which only your institution and{' '}
                {teamName(dealName)} can see.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant={'outline'}
                onClick={() => setDropAwaitingConsent(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void folderDrop.addDropped(dropAwaitingConsent, places.own.id);
                  setDropAwaitingConsent(null);
                }}
              >
                Add to {OWN_SPACE}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

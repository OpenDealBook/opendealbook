'use client';

import { useRouter } from 'next/navigation';

import type { DocumentSeenBy } from '@odb/lender-rooms/activity/queries.ts';
import {
  hideForRoom,
  unhideForRoom,
} from '@odb/lender-rooms/contents/hide-actions.ts';
import type {
  HiddenMark,
  MarkedRoomFile,
  MarkedRoomFolder,
  RoomFileVersion,
} from '@odb/lender-rooms/contents/listing.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { cn } from '@odb/ui/utils';

import { LenderFileLink } from './lender-file-link';
import {
  type SpaceActions,
  SpaceFolderControls,
  SpaceUploads,
} from './lender-space-uploads';
import { countWording, personLabel, teamSignInPath } from './lender-wording';

type HideTarget = { kind: 'folder' | 'document'; id: string };

interface FilesContext {
  roomId: string;
  seenBy: DocumentSeenBy[];
  isPending: boolean;
  toggle: ((target: HideTarget, isHidden: boolean) => void) | null;
  ownSpace: SpaceActions | null;
}

function HiddenBadge({ hidden }: { hidden: HiddenMark }) {
  if (hidden.direct) {
    return <Badge variant={'secondary'}>Hidden from this lender</Badge>;
  }

  return hidden.inherited ? (
    <Badge variant={'outline'} className={'text-muted-foreground'}>
      Hidden with its folder
    </Badge>
  ) : null;
}

function HideToggle({
  name,
  target,
  hidden,
  context,
}: {
  name: string;
  target: HideTarget;
  hidden: HiddenMark;
  context: FilesContext;
}) {
  if (!context.toggle) {
    return null;
  }

  const { toggle } = context;

  return (
    <Button
      size={'sm'}
      variant={'ghost'}
      disabled={context.isPending}
      aria-label={
        hidden.direct
          ? `Show ${name} to this lender`
          : `Hide ${name} from this lender`
      }
      onClick={() => toggle(target, hidden.direct)}
    >
      {hidden.direct ? 'Show' : 'Hide'}
    </Button>
  );
}

function SeenBy({
  documentId,
  seenBy,
}: {
  documentId: string;
  seenBy: DocumentSeenBy[];
}) {
  const viewers = seenBy.filter((seen) => seen.documentId === documentId);

  return (
    <div className={'text-muted-foreground flex flex-col gap-0.5 text-xs'}>
      {viewers.some((viewer) => viewer.side === 'lender') ? null : (
        <p>Not seen by the lender yet</p>
      )}
      <ul className={'flex flex-col gap-0.5'}>
        {viewers.map((viewer) => (
          <li key={viewer.userId}>
            <span className={'text-foreground'}>
              {personLabel(viewer)}
              {viewer.isRemoved ? ' (removed)' : null}
            </span>{' '}
            {viewer.side === 'internal' ? (
              <Badge
                variant={'outline'}
                className={'px-1.5 py-0 text-[0.7rem]'}
              >
                Internal
              </Badge>
            ) : null}{' '}
            {viewer.firstPreviewedAt ? (
              <>
                previewed <LocalTime at={viewer.firstPreviewedAt} />
              </>
            ) : null}
            {viewer.firstPreviewedAt && viewer.firstDownloadedAt ? ', ' : null}
            {viewer.firstDownloadedAt ? (
              <>
                downloaded <LocalTime at={viewer.firstDownloadedAt} />
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EarlierVersion({
  fileName,
  version,
  context,
}: {
  fileName: string;
  version: RoomFileVersion;
  context: FilesContext;
}) {
  return (
    <li className={'flex flex-col gap-0.5'}>
      <span className={'flex flex-wrap items-baseline gap-x-2 text-xs'}>
        <LenderFileLink
          source={{ roomId: context.roomId }}
          documentId={version.documentId}
          fileName={fileName}
          label={`Version ${version.version}`}
          downloadLabel={`Download version ${version.version} of ${fileName}`}
        />
        <span className={'text-muted-foreground'}>
          added <LocalTime at={version.createdAt} />
        </span>
      </span>
      <SeenBy documentId={version.documentId} seenBy={context.seenBy} />
    </li>
  );
}

function FileRow({
  file,
  context,
}: {
  file: MarkedRoomFile;
  context: FilesContext;
}) {
  const isHidden = file.hidden.direct || file.hidden.inherited;

  return (
    <li
      data-entry={file.name}
      className={'flex flex-col gap-1.5 py-2.5 pr-2 pl-3'}
    >
      <div className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
        <LenderFileLink
          source={{ roomId: context.roomId }}
          documentId={file.documentId}
          fileName={file.name}
          downloadLabel={`Download ${file.name}`}
          className={isHidden ? 'text-muted-foreground' : undefined}
        />
        <span className={'text-muted-foreground text-xs'}>
          Version {file.version}, added <LocalTime at={file.createdAt} />
        </span>
        <HiddenBadge hidden={file.hidden} />
        <span className={'ml-auto'}>
          <HideToggle
            name={file.name}
            target={{ kind: 'document', id: file.documentId }}
            hidden={file.hidden}
            context={context}
          />
        </span>
      </div>
      <div className={'flex flex-col gap-1.5'}>
        <SeenBy documentId={file.documentId} seenBy={context.seenBy} />
        {file.earlierVersions.length === 0 ? null : (
          <details>
            <summary className={'cursor-pointer text-xs'}>
              {countWording(
                file.earlierVersions.length,
                'earlier version',
                'earlier versions',
              )}
            </summary>
            <ul className={'flex flex-col gap-2 pt-2 pl-3'}>
              {file.earlierVersions.map((version) => (
                <EarlierVersion
                  key={version.documentId}
                  fileName={file.name}
                  version={version}
                  context={context}
                />
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

function FolderContents({
  folder,
  context,
}: {
  folder: MarkedRoomFolder;
  context: FilesContext;
}) {
  if (folder.folders.length === 0 && folder.entries.length === 0) {
    return (
      <p className={'text-muted-foreground px-3 py-2.5 text-sm'}>
        Nothing here yet.
      </p>
    );
  }

  return (
    <ul className={'divide-y'}>
      {folder.folders.map((child) => (
        <li key={child.id}>
          <div
            data-entry={child.name}
            onDrop={
              context.ownSpace
                ? (event) => {
                    event.stopPropagation();
                    context.ownSpace!.drop(event, child.id);
                  }
                : undefined
            }
            className={
              'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-3'
            }
          >
            <span
              className={cn(
                'font-serif text-base font-medium',
                (child.hidden.direct || child.hidden.inherited) &&
                  'text-muted-foreground',
              )}
            >
              {child.name}
            </span>
            <HiddenBadge hidden={child.hidden} />
            <span className={'ml-auto'}>
              <HideToggle
                name={child.name}
                target={{ kind: 'folder', id: child.id }}
                hidden={child.hidden}
                context={context}
              />
              {context.ownSpace ? (
                <SpaceFolderControls
                  folder={child}
                  actions={context.ownSpace}
                />
              ) : null}
            </span>
          </div>
          <div className={'ml-5 border-l'}>
            <FolderContents folder={child} context={context} />
          </div>
        </li>
      ))}
      {folder.entries.map((entry) =>
        entry.kind === 'file' ? (
          <FileRow key={entry.documentId} file={entry} context={context} />
        ) : (
          <li
            key={entry.id}
            data-entry={entry.name}
            className={'text-muted-foreground px-3 py-2.5 text-sm'}
          >
            {entry.name}, too large to store
          </li>
        ),
      )}
    </ul>
  );
}

export function LenderRoomFiles({
  roomId,
  listing,
  seenBy,
}: {
  roomId: string;
  listing: { master: MarkedRoomFolder; private: MarkedRoomFolder };
  seenBy: DocumentSeenBy[];
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const shared = { roomId, seenBy, isPending };

  return (
    <div className={'flex flex-col gap-8'}>
      <ProblemNote problem={problem} signInPath={teamSignInPath} />

      <section className={'flex flex-col gap-2'}>
        <div className={'flex flex-col'}>
          <h2 className={'font-medium'}>Lender package</h2>
          <p className={'text-muted-foreground text-sm'}>
            Shared with every lender room. Hide a file or folder to keep it from
            this lender only.
          </p>
        </div>
        <div className={'bg-card rounded-lg border'}>
          <FolderContents
            folder={listing.master}
            context={{
              ...shared,
              ownSpace: null,
              toggle: (target, isHidden) =>
                attempt(
                  () =>
                    isHidden
                      ? unhideForRoom({ roomId, target })
                      : hideForRoom({ roomId, target }),
                  () => router.refresh(),
                ),
            }}
          />
        </div>
      </section>

      <SpaceUploads
        space={{ roomId }}
        rootFolderId={listing.private.id}
        title={"This room's own folder"}
        description={
          'Only this lender sees these files. Drop files or whole folders here to add them.'
        }
        addLabel={'Upload files'}
        settleLabel={'Add to room'}
      >
        {(actions) => (
          <FolderContents
            folder={listing.private}
            context={{ ...shared, toggle: null, ownSpace: actions }}
          />
        )}
      </SpaceUploads>
    </div>
  );
}

'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { FileSource } from '@odb/lender-rooms/browser/file-access.ts';
import type { RoomFolder } from '@odb/lender-rooms/contents/listing.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { startLenderPackage } from '@odb/lender-rooms/rooms/actions.ts';
import { removePackageFile } from '@odb/lender-rooms/uploads/package-actions.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

import { LenderFileLink } from './lender-file-link';
import {
  type SpaceActions,
  SpaceFolderControls,
  SpaceUploads,
} from './lender-space-uploads';
import { countWording, teamSignInPath } from './lender-wording';

interface PackageFileToRemove {
  documentId: string;
  name: string;
}

function PackageFolder({
  folder,
  actions,
  source,
  onRemove,
}: {
  folder: RoomFolder;
  actions: SpaceActions;
  source: FileSource;
  onRemove: (file: PackageFileToRemove) => void;
}) {
  if (folder.folders.length === 0 && folder.entries.length === 0) {
    return (
      <p className={'text-muted-foreground px-3 py-2.5 text-sm'}>
        Drop files here or use Add files.
      </p>
    );
  }

  return (
    <ul className={'divide-y'}>
      {folder.folders.map((child) => (
        <li key={child.id}>
          <div
            data-entry={child.name}
            className={
              'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-3'
            }
            onDrop={(event) => {
              event.stopPropagation();
              actions.drop(event, child.id);
            }}
          >
            <span className={'font-serif text-base font-medium'}>
              {child.name}
            </span>
            <span className={'ml-auto'}>
              <SpaceFolderControls folder={child} actions={actions} />
            </span>
          </div>
          <div className={'ml-5 border-l'}>
            <PackageFolder
              folder={child}
              actions={actions}
              source={source}
              onRemove={onRemove}
            />
          </div>
        </li>
      ))}
      {folder.entries.map((entry) =>
        entry.kind === 'file' ? (
          <li
            key={entry.documentId}
            className={'flex flex-col gap-1.5 px-3 py-2.5 text-sm'}
          >
            <span className={'flex flex-wrap items-baseline gap-x-3'}>
              <LenderFileLink
                source={source}
                documentId={entry.documentId}
                fileName={entry.name}
                downloadLabel={`Download ${entry.name}`}
              />
              <span className={'text-muted-foreground text-xs'}>
                Version {entry.version}
              </span>
              <Button
                size={'sm'}
                variant={'ghost'}
                className={'ml-auto'}
                aria-label={`Remove ${entry.name}`}
                onClick={() =>
                  onRemove({ documentId: entry.documentId, name: entry.name })
                }
              >
                Remove
              </Button>
            </span>
            {entry.earlierVersions.length === 0 ? null : (
              <details>
                <summary className={'cursor-pointer text-xs'}>
                  {countWording(
                    entry.earlierVersions.length,
                    'earlier version',
                    'earlier versions',
                  )}
                </summary>
                <ul className={'flex flex-col gap-1 pt-2 pl-3'}>
                  {entry.earlierVersions.map((version) => (
                    <li
                      key={version.documentId}
                      className={
                        'flex flex-wrap items-baseline gap-x-2 text-xs'
                      }
                    >
                      <LenderFileLink
                        source={source}
                        documentId={version.documentId}
                        fileName={entry.name}
                        label={`Version ${version.version}`}
                        downloadLabel={`Download version ${version.version} of ${entry.name}`}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ) : (
          <li
            key={entry.id}
            className={'text-muted-foreground px-3 py-2.5 text-sm'}
          >
            {entry.name}, too large to store
          </li>
        ),
      )}
    </ul>
  );
}

function StartPackage({ dealId }: { dealId: string }) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();

  return (
    <section className={'flex flex-col items-start gap-2'}>
      <h2 className={'font-medium'}>Lender package</h2>
      <p className={'text-muted-foreground text-sm'}>
        Start the package now and add files to it. Lenders will see everything
        in it once their rooms are created.
      </p>
      <Button
        disabled={isPending}
        onClick={() =>
          attempt(
            () => startLenderPackage({ dealId }),
            () => router.refresh(),
          )
        }
      >
        Start the lender package
      </Button>
      <ProblemNote problem={problem} signInPath={teamSignInPath} />
    </section>
  );
}

export function LenderPackage({
  accountSlug,
  dealId,
  pkg,
}: {
  accountSlug: string;
  dealId: string;
  pkg: RoomFolder | null;
}) {
  if (pkg === null) {
    return <StartPackage dealId={dealId} />;
  }

  const router = useRouter();
  const removal = useAttempt();
  const [removing, setRemoving] = useState<PackageFileToRemove | null>(null);

  return (
    <div className={'flex flex-col gap-2'}>
      <ProblemNote problem={removal.problem} signInPath={teamSignInPath} />
      <SpaceUploads
        space={{ dealId }}
        rootFolderId={pkg.id}
        title={'Lender package'}
        description={
          'Every lender room sees these files unless a room hides them. Drop files or whole folders here to add them.'
        }
        addLabel={'Add files'}
        settleLabel={'Add to package'}
      >
        {(actions) => (
          <PackageFolder
            folder={pkg}
            actions={actions}
            source={{ accountSlug, dealId }}
            onRemove={setRemoving}
          />
        )}
      </SpaceUploads>
      <Dialog
        open={removing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRemoving(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove {removing?.name} from the lender package?
            </DialogTitle>
            <DialogDescription>
              Every lender room stops showing it. Past views and downloads stay
              in the activity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant={'outline'} onClick={() => setRemoving(null)}>
              Keep file
            </Button>
            <Button
              variant={'destructive'}
              onClick={() => {
                const { documentId } = removing!;

                setRemoving(null);
                removal.attempt(
                  () => removePackageFile({ dealId, documentId }),
                  () => router.refresh(),
                );
              }}
            >
              Remove file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

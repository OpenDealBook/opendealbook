'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import {
  closeAskAsInternal,
  promoteAskFile,
  replyToAskAsInternal,
} from '@odb/lender-rooms/asks/internal-actions.ts';
import {
  closeFormAsInternal,
  replyToFormAsInternal,
  returnCompletedForm,
} from '@odb/lender-rooms/forms/internal-actions.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { MessageWithAttachments } from '@odb/lender-rooms/requests-ui/message-with-attachments.tsx';
import {
  LiveRegion,
  ProblemNote,
} from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import type {
  ThreadEntry,
  ThreadFile,
} from '@odb/lender-rooms/requests-ui/thread.ts';
import { attachedDocumentIds } from '@odb/lender-rooms/requests-ui/upload-queue.ts';
import {
  AttachButton,
  UploadList,
  useUploads,
} from '@odb/lender-rooms/requests-ui/uploads.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import type { Enums } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';
import { cn } from '@odb/ui/utils';

import { LenderFileLink } from './lender-file-link';
import {
  type FormSignature,
  LenderFormSignature,
} from './lender-form-signature';
import { teamSignInPath } from './lender-wording';

interface Request {
  kind: Enums<'lender_ask_kind'>;
  id: string;
  status: Enums<'lender_ask_status'>;
  return_route: Enums<'lender_return_route'> | null;
}

interface PackageFolder {
  id: string;
  path: string;
}

type Run = (
  action: () => Promise<ActionResult<unknown>>,
  onAccepted?: () => void,
) => void;

function Promote({
  file,
  askFileId,
  packageFolders,
  isPending,
  run,
}: {
  file: Extract<ThreadFile, { isAvailable: true }>;
  askFileId: string;
  packageFolders: PackageFolder[];
  isPending: boolean;
  run: Run;
}) {
  const [folderId, setFolderId] = useState(packageFolders[0]!.id);
  const [isAdded, setIsAdded] = useState(false);

  return (
    <div className={'flex flex-wrap items-center gap-2 text-sm'}>
      <select
        aria-label={`Lender package folder for ${file.name}`}
        className={'bg-background h-8 rounded-md border px-2 text-sm'}
        value={folderId}
        onChange={(event) => setFolderId(event.target.value)}
      >
        {packageFolders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.path}
          </option>
        ))}
      </select>
      <Button
        size={'sm'}
        variant={'outline'}
        disabled={isPending}
        aria-label={`Add ${file.name} to lender package`}
        onClick={() =>
          run(
            () => promoteAskFile({ askFileId, folderId }),
            () => setIsAdded(true),
          )
        }
      >
        Add to lender package
      </Button>
      <LiveRegion
        message={
          isAdded
            ? `${file.name} is now in the lender package, so every lender room can see it`
            : null
        }
      />
      {isAdded ? (
        <span className={'text-muted-foreground'}>
          {file.name} is now in the lender package, so every lender room can see
          it.
        </span>
      ) : null}
    </div>
  );
}

function ReturnCompletedForm({
  roomId,
  privateFolderId,
  formId,
  isPending,
  run,
}: {
  roomId: string;
  privateFolderId: string;
  formId: string;
  isPending: boolean;
  run: Run;
}) {
  const uploads = useUploads({ space: { roomId }, folderId: privateFolderId });
  const documentIds = attachedDocumentIds(uploads.queue);

  return (
    <section className={'bg-card flex flex-col gap-3 rounded-lg border p-4'}>
      <div className={'flex flex-col gap-1'}>
        <h2 className={'font-medium'}>Return the completed form</h2>
        <p className={'text-muted-foreground text-sm'}>
          Download the lender&apos;s form from the thread above, fill it in, and
          upload the completed file here. It lands in this lender&apos;s room
          only.
        </p>
      </div>
      <AttachButton onPick={uploads.replaceWithFirst} multiple={false}>
        Choose completed form
      </AttachButton>
      <UploadList
        signInPath={teamSignInPath}
        queuedKeys={uploads.queuedKeys}
        queue={uploads.queue}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      <LiveRegion message={uploads.announcement} />
      <Button
        className={'w-fit'}
        disabled={isPending || documentIds.length === 0}
        onClick={() =>
          run(() => returnCompletedForm({ formId, documentIds }), uploads.clear)
        }
      >
        Return completed form
      </Button>
    </section>
  );
}

export function LenderRequestThread({
  roomId,
  privateFolderId,
  request,
  thread,
  fulfilmentFileIds,
  packageFolders,
  signatures,
}: {
  roomId: string;
  privateFolderId: string;
  request: Request;
  thread: ThreadEntry[];
  fulfilmentFileIds: Record<string, string>;
  packageFolders: PackageFolder[];
  signatures: FormSignature[];
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const [body, setBody] = useState('');

  const run: Run = (action, onAccepted) =>
    attempt(action, () => {
      onAccepted?.();
      router.refresh();
    });

  return (
    <div className={'flex flex-col gap-6'}>
      <ol className={'flex flex-col gap-4'}>
        {thread.map((entry) => (
          <li
            key={entry.key}
            className={cn(
              'flex max-w-3xl flex-col gap-1.5 rounded-lg border p-3',
              entry.side === 'internal'
                ? 'bg-secondary/50 ml-8'
                : 'bg-card mr-8',
            )}
          >
            <div className={'flex flex-wrap items-baseline gap-x-2 text-sm'}>
              <span className={'font-medium'}>
                {entry.side === 'internal'
                  ? 'Deal team'
                  : (entry.authorName ?? 'Lender')}
              </span>
              <span className={'text-muted-foreground text-xs'}>
                <LocalTime at={entry.at} />
              </span>
            </div>
            {entry.kind === 'message' ? (
              <p className={'whitespace-pre-line'}>{entry.body}</p>
            ) : (
              <ul className={'flex flex-col gap-2'}>
                {entry.files.map((file) => {
                  const askFileId = fulfilmentFileIds[file.documentId];

                  return (
                    <li key={file.documentId} className={'flex flex-col gap-2'}>
                      {file.isAvailable ? (
                        <span className={'flex flex-wrap items-center gap-2'}>
                          <LenderFileLink
                            source={{ roomId: roomId }}
                            documentId={file.documentId}
                            fileName={file.name}
                            downloadLabel={`Download ${file.name}`}
                          />
                          {file.label ? (
                            <Badge variant={'outline'}>{file.label}</Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className={'text-muted-foreground text-sm'}>
                          {file.notice}
                        </span>
                      )}
                      {file.isAvailable && askFileId ? (
                        <Promote
                          file={file}
                          askFileId={askFileId}
                          packageFolders={packageFolders}
                          isPending={isPending}
                          run={run}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {request.kind === 'form' && request.return_route === 'upload' ? (
        <ReturnCompletedForm
          roomId={roomId}
          privateFolderId={privateFolderId}
          formId={request.id}
          isPending={isPending}
          run={run}
        />
      ) : null}

      {request.kind === 'form' && request.return_route === 'esign' ? (
        <LenderFormSignature formId={request.id} signatures={signatures} />
      ) : null}

      <section className={'flex max-w-3xl flex-col gap-2'}>
        <MessageWithAttachments
          signInPath={teamSignInPath}
          roomId={roomId}
          privateFolderId={privateFolderId}
          isTyped={body.trim() !== ''}
          needsTextOrFile
          sendLabel={'Send reply'}
          sentWording={'Reply sent'}
          discardWording={'Discard your reply?'}
          send={(documentIds) => {
            const reply = {
              ...(body.trim() ? { body } : {}),
              documentIds,
            };

            return request.kind === 'ask'
              ? replyToAskAsInternal({ askId: request.id, ...reply })
              : replyToFormAsInternal({ formId: request.id, ...reply });
          }}
          onSent={() => setBody('')}
        >
          <Label htmlFor={'request-reply'}>Reply</Label>
          <Textarea
            id={'request-reply'}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </MessageWithAttachments>
        {request.kind === 'ask' ? (
          <p className={'text-muted-foreground text-sm'}>
            Files you attach fulfil this request and land in this lender&apos;s
            room only. Add one to the lender package afterwards to share it with
            every lender.
          </p>
        ) : null}
      </section>

      {request.status === 'closed' ? null : (
        <Button
          variant={'outline'}
          className={'w-fit'}
          disabled={isPending}
          onClick={() =>
            run(() =>
              request.kind === 'ask'
                ? closeAskAsInternal({ askId: request.id })
                : closeFormAsInternal({ formId: request.id }),
            )
          }
        >
          Close request
        </Button>
      )}

      <ProblemNote problem={problem} signInPath={teamSignInPath} />
    </div>
  );
}

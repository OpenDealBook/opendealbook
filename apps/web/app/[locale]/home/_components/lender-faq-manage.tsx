'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import {
  addDataRoomFileToFaq,
  addUploadedFaqFile,
  beginFaqUpload,
  deleteFaqDraft,
  editFaqEntry,
  hideFaqEntryForRoom,
  removeFaqFile,
  setFaqEntryPinned,
  setFaqEntryStatus,
  unhideFaqEntryForRoom,
} from '@odb/lender-rooms/faq/manage.ts';
import type { TeamFaqEntry } from '@odb/lender-rooms/faq/team-queries.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { getSupabaseBrowserClient } from '@odb/supabase/client';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { teamSignInPath } from './lender-wording';

interface Named {
  id: string;
  name: string;
}

const statusSteps: Record<
  TeamFaqEntry['status'],
  { label: string; move: { label: string; to: 'published' | 'unpublished' } }
> = {
  draft: { label: 'Draft', move: { label: 'Publish', to: 'published' } },
  published: {
    label: 'Published',
    move: { label: 'Unpublish', to: 'unpublished' },
  },
  unpublished: {
    label: 'Unpublished',
    move: { label: 'Republish', to: 'published' },
  },
};

export function LenderFaqManager({
  entries,
  rooms,
  documents,
}: {
  entries: TeamFaqEntry[];
  rooms: Named[];
  documents: Named[];
}) {
  if (entries.length === 0) {
    return (
      <p
        className={
          'text-muted-foreground rounded-xl border border-dashed p-10 text-sm'
        }
      >
        No FAQ entries yet. Open an answered lender ask and choose Add to FAQ to
        write the first one.
      </p>
    );
  }

  return (
    <ol className={'flex flex-col gap-4'}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <FaqEntryCard entry={entry} rooms={rooms} documents={documents} />
        </li>
      ))}
    </ol>
  );
}

function FaqEntryCard({
  entry,
  rooms,
  documents,
}: {
  entry: TeamFaqEntry;
  rooms: Named[];
  documents: Named[];
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const step = statusSteps[entry.status];
  const headingId = `faq-entry-${entry.id}`;

  function run(
    action: () => Promise<ActionResult<unknown>>,
    onAccepted?: () => void,
  ) {
    attempt(action, () => {
      onAccepted?.();
      router.refresh();
    });
  }

  return (
    <article
      aria-labelledby={headingId}
      className={'bg-card flex flex-col gap-4 rounded-lg border p-5'}
    >
      <header className={'flex flex-wrap items-start justify-between gap-3'}>
        <h2
          id={headingId}
          className={'max-w-2xl font-medium break-words whitespace-pre-line'}
        >
          {entry.question}
        </h2>
        <div className={'flex items-center gap-2'}>
          <Badge variant={entry.status === 'published' ? 'default' : 'outline'}>
            {step.label}
          </Badge>
          {entry.pinned ? <Badge variant={'secondary'}>Pinned</Badge> : null}
        </div>
      </header>

      {isEditing ? (
        <FaqEntryEdit
          entry={entry}
          isPending={isPending}
          onSave={(wording) =>
            run(
              () =>
                editFaqEntry({
                  entryId: entry.id,
                  version: entry.version,
                  ...wording,
                }),
              () => setIsEditing(false),
            )
          }
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <p className={'text-muted-foreground max-w-3xl whitespace-pre-line'}>
          {entry.answer}
        </p>
      )}

      <FaqEntryFiles
        entry={entry}
        documents={documents}
        isPending={isPending}
        run={run}
      />

      <fieldset className={'flex flex-col gap-2'}>
        <legend className={'mb-2 text-sm font-medium'}>Shown in</legend>
        <div className={'flex flex-wrap gap-x-5 gap-y-2'}>
          {rooms.map((room) => {
            const isShown = !entry.hiddenRoomIds.includes(room.id);
            const input = { roomId: room.id, entryId: entry.id };

            return (
              <span key={room.id} className={'flex items-center gap-2 text-sm'}>
                <Checkbox
                  id={`${headingId}-${room.id}`}
                  aria-label={`Show in ${room.name}`}
                  checked={isShown}
                  disabled={isPending}
                  onCheckedChange={() =>
                    run(() =>
                      isShown
                        ? hideFaqEntryForRoom(input)
                        : unhideFaqEntryForRoom(input),
                    )
                  }
                />
                <label htmlFor={`${headingId}-${room.id}`}>{room.name}</label>
              </span>
            );
          })}
        </div>
      </fieldset>

      <ProblemNote problem={problem} signInPath={teamSignInPath} />

      <footer className={'flex flex-wrap gap-2 border-t pt-4'}>
        {isEditing ? null : (
          <Button
            size={'sm'}
            variant={'outline'}
            disabled={isPending}
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        )}
        <Button
          size={'sm'}
          variant={entry.status === 'published' ? 'outline' : 'default'}
          disabled={isPending}
          onClick={() =>
            run(() =>
              setFaqEntryStatus({ entryId: entry.id, status: step.move.to }),
            )
          }
        >
          {step.move.label}
        </Button>
        <Button
          size={'sm'}
          variant={'outline'}
          disabled={isPending}
          onClick={() =>
            run(() =>
              setFaqEntryPinned({ entryId: entry.id, pinned: !entry.pinned }),
            )
          }
        >
          {entry.pinned ? 'Unpin' : 'Pin'}
        </Button>
        {entry.status === 'draft' ? (
          <>
            <Button
              size={'sm'}
              variant={'ghost'}
              disabled={isPending}
              onClick={() => setIsDeleting(true)}
            >
              Delete draft
            </Button>
            <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this draft?</DialogTitle>
                  <DialogDescription>
                    No lender has seen it. The draft and its files are removed
                    for good.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant={'outline'}
                    onClick={() => setIsDeleting(false)}
                  >
                    Keep draft
                  </Button>
                  <Button
                    variant={'destructive'}
                    onClick={() => {
                      setIsDeleting(false);
                      run(() => deleteFaqDraft({ entryId: entry.id }));
                    }}
                  >
                    Yes, delete it
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </footer>
    </article>
  );
}

function FaqEntryEdit({
  entry,
  isPending,
  onSave,
  onCancel,
}: {
  entry: TeamFaqEntry;
  isPending: boolean;
  onSave: (wording: { question: string; answer: string }) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(entry.question);
  const [answer, setAnswer] = useState(entry.answer);

  return (
    <form
      className={'flex max-w-3xl flex-col gap-3'}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ question, answer });
      }}
    >
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`faq-question-${entry.id}`}>Question</Label>
        <Textarea
          id={`faq-question-${entry.id}`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={`faq-answer-${entry.id}`}>Answer</Label>
        <Textarea
          id={`faq-answer-${entry.id}`}
          className={'min-h-32'}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
      </div>
      <div className={'flex gap-2'}>
        <Button size={'sm'} type={'submit'} disabled={isPending}>
          Save changes
        </Button>
        <Button
          size={'sm'}
          type={'button'}
          variant={'outline'}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FaqEntryFiles({
  entry,
  documents,
  isPending,
  run,
}: {
  entry: TeamFaqEntry;
  documents: Named[];
  isPending: boolean;
  run: (action: () => Promise<ActionResult<unknown>>) => void;
}) {
  const [documentId, setDocumentId] = useState(documents[0]?.id);

  function upload(file: File) {
    run(async () => {
      const begun = await beginFaqUpload({
        entryId: entry.id,
        name: file.name,
        size: file.size,
      });

      if (!begun.ok) {
        return begun;
      }

      const stored = await getSupabaseBrowserClient()
        .storage.from(DATA_ROOM_BUCKET)
        .uploadToSignedUrl(begun.value.path, begun.value.token, file);

      if (stored.error) {
        throw stored.error;
      }

      return addUploadedFaqFile({ uploadId: begun.value.uploadId });
    });
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h3 className={'text-sm font-medium'}>Files</h3>
      {entry.files.length > 0 ? (
        <ul className={'flex flex-col gap-1'}>
          {entry.files.map((file) => (
            <li key={file.id} className={'flex items-center gap-2 text-sm'}>
              {file.name}
              <Button
                size={'sm'}
                variant={'ghost'}
                className={'text-muted-foreground h-7'}
                disabled={isPending}
                aria-label={`Remove ${file.name}`}
                onClick={() => run(() => removeFaqFile({ fileId: file.id }))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={'flex flex-wrap items-center gap-2'}>
        {documentId ? (
          <>
            <select
              aria-label={'Data room file'}
              className={'bg-background h-8 rounded-md border px-2 text-sm'}
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
            >
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
            <Button
              size={'sm'}
              variant={'outline'}
              disabled={isPending}
              onClick={() =>
                run(() =>
                  addDataRoomFileToFaq({ entryId: entry.id, documentId }),
                )
              }
            >
              Add from data room
            </Button>
          </>
        ) : null}
        <Input
          type={'file'}
          aria-label={'Upload a file'}
          className={'h-8 w-fit text-sm'}
          disabled={isPending}
          onChange={(event) => {
            upload(event.target.files![0]!);
            event.target.value = '';
          }}
        />
      </div>
    </section>
  );
}

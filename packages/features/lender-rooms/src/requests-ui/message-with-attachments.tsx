'use client';

import { type ReactNode, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { SendIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import { cn } from '@odb/ui/utils';

import type { ActionResult } from '../actions/refusal';
import { LeavePrompt, useUnsentWork } from './discard';
import { LiveRegion, ProblemNote } from './refusal-note';
import { hasUsableUpload, sendBlocker } from './upload-queue';
import {
  AttachButton,
  KeepAsZipTick,
  UploadList,
  useFileDrop,
  useUploads,
} from './uploads';
import { useAttempt } from './use-attempt';

export function MessageWithAttachments({
  roomId,
  privateFolderId,
  isTyped,
  needsTextOrFile,
  sendLabel,
  sentWording,
  discardWording,
  send,
  onSent,
  signInPath,
  children,
}: {
  roomId: string;
  privateFolderId: string;
  isTyped: boolean;
  needsTextOrFile: boolean;
  sendLabel: string;
  sentWording: string;
  discardWording: string;
  send: (documentIds: string[]) => Promise<ActionResult<unknown>>;
  onSent: () => void;
  signInPath?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [keepAsZip, setKeepAsZip] = useState(false);
  const attachButton = useRef<HTMLButtonElement>(null);
  const uploads = useUploads({
    space: { roomId },
    folderId: privateFolderId,
    registerWhen: 'when-sent',
  });
  const drop = useFileDrop(uploads.pick);
  const { problem, isPending, attempt } = useAttempt();
  const isUnsent = isTyped || uploads.queue.length > 0;

  useUnsentWork(isUnsent);
  const blocker = sendBlocker(uploads.queue);
  const cannotSend =
    isPending ||
    blocker !== null ||
    (needsTextOrFile && !isTyped && !hasUsableUpload(uploads.queue));

  function submit() {
    if (cannotSend) {
      return;
    }

    attempt(
      async () => {
        const files = await uploads.registerHeldUploads(keepAsZip);

        return files.ok ? send(files.value) : files;
      },
      () => {
        setKeepAsZip(false);
        uploads.clear();
        uploads.announce(sentWording);
        onSent();
        router.refresh();
      },
    );
  }

  return (
    <form
      className={'flex flex-col gap-2'}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div
        {...drop.dropProps}
        className={cn(
          'bg-card focus-within:border-ring focus-within:ring-ring/30 flex flex-col gap-2 rounded-xl border p-3 shadow-sm transition-[border-color,box-shadow] focus-within:ring-[3px]',
          drop.isOver && 'border-ring bg-secondary border-dashed',
        )}
      >
        {children}

        <UploadList
          queue={uploads.queue}
          onRemove={uploads.remove}
          onRetry={uploads.retry}
          focusAfterLast={attachButton}
          signInPath={signInPath}
        />
        <KeepAsZipTick
          queue={uploads.queue}
          isTicked={keepAsZip}
          onTick={setKeepAsZip}
        />

        <div className={'flex flex-wrap items-center justify-between gap-2'}>
          <div className={'flex items-center gap-1'}>
            <AttachButton
              onPick={uploads.pick}
              multiple
              buttonRef={attachButton}
            >
              Attach files
            </AttachButton>
            <span className={'text-muted-foreground hidden text-sm sm:inline'}>
              or drop them here
            </span>
          </div>
          <div className={'flex items-center gap-3'}>
            {blocker ? (
              <span className={'text-muted-foreground text-sm'}>{blocker}</span>
            ) : null}
            <Button type={'submit'} disabled={cannotSend}>
              <SendIcon />
              {sendLabel}
            </Button>
          </div>
        </div>
      </div>

      <ProblemNote
        problem={problem}
        signInPath={signInPath}
        crashWording={
          'Something went wrong. Your text is still here. Try again.'
        }
      />
      <LiveRegion message={uploads.announcement} />
      <LeavePrompt isUnsent={isUnsent} wording={discardWording} />
    </form>
  );
}

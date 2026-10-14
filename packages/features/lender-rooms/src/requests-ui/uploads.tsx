'use client';

import {
  type DragEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  CheckIcon,
  FileIcon,
  PaperclipIcon,
  RotateCwIcon,
  XIcon,
} from 'lucide-react';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { getSupabaseBrowserClient } from '@odb/supabase/client';
import { Button } from '@odb/ui/button';
import { Spinner } from '@odb/ui/spinner';
import { cn } from '@odb/ui/utils';

import type { ActionResult } from '../actions/refusal';
import { beginUpload, cancelUpload, registerUpload } from '../uploads/actions';
import type { SpaceTarget } from '../uploads/targets';
import { RefusalNote } from './refusal-note';
import {
  type QueuedUpload,
  type RegisterWhen,
  attachedDocumentIds,
  heldUploads,
  isZip,
  offersKeepAsZip,
  pickedUploads,
  uploadAnnouncement,
  uploadQueue,
  uploadStatus,
  waitsToBeSent,
} from './upload-queue';

type UploadEvent = Parameters<typeof uploadQueue>[1];

const MAX_UPLOADS_AT_ONCE = 4;

interface Sending {
  file: File;
  into: string;
}

export function useUploads({
  space,
  folderId,
  registerWhen = 'when-picked',
}: {
  space: SpaceTarget;
  folderId: string;
  registerWhen?: RegisterWhen;
}) {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [queuedKeys, setQueuedKeys] = useState<ReadonlySet<string>>(new Set());
  const queueNow = useRef<QueuedUpload[]>([]);
  const sendingByKey = useRef(new Map<string, Sending>());
  const waitingForASlot = useRef<{ key: string; sending: Sending }[]>([]);
  const sendingCount = useRef(0);

  function apply(event: UploadEvent) {
    const toAnnounce = uploadAnnouncement(queueNow.current, event);

    queueNow.current = uploadQueue(queueNow.current, event);
    setQueue(queueNow.current);

    if (toAnnounce) {
      setAnnouncement(toAnnounce);
    }
  }

  function cancelWaiting(waiting: { uploadId: string }[]) {
    if (registerWhen === 'when-sent') {
      for (const { uploadId } of waiting) {
        void cancelUpload({ uploadId });
      }
    }
  }

  useEffect(
    () => () => {
      if (registerWhen === 'when-sent') {
        for (const { uploadId } of heldUploads(queueNow.current)) {
          void cancelUpload({ uploadId });
        }
      }
    },
    [registerWhen],
  );

  async function send(key: string, { file, into }: Sending) {
    try {
      const begun = await beginUpload({
        ...space,
        folderId: into,
        name: file.name,
        size: file.size,
      });

      if (!begun.ok) {
        apply({ kind: 'refused', key, message: begun.refusal });
        return;
      }

      const { uploadId, path, token } = begun.value;

      const stored = await getSupabaseBrowserClient()
        .storage.from(DATA_ROOM_BUCKET)
        .uploadToSignedUrl(path, token, file);

      if (stored.error) {
        apply({ kind: 'failed', key });
        return;
      }

      apply({ kind: 'stored', key, uploadId, registerWhen });

      if (waitsToBeSent(file.name, registerWhen)) {
        return;
      }

      const registered = await registerUpload({ uploadId, keepAsZip: false });

      apply(
        registered.ok
          ? { kind: 'attached', key, documentIds: registered.value }
          : { kind: 'refused', key, message: registered.refusal },
      );
    } catch {
      apply({ kind: 'failed', key });
    }
  }

  function fillFreeSlots() {
    while (sendingCount.current < MAX_UPLOADS_AT_ONCE) {
      const next = waitingForASlot.current.shift();

      if (!next) {
        break;
      }

      sendingCount.current += 1;
      void send(next.key, next.sending).finally(() => {
        sendingCount.current -= 1;
        fillFreeSlots();
      });
    }

    setQueuedKeys(new Set(waitingForASlot.current.map(({ key }) => key)));
  }

  function waitForASlot(waiting: { key: string; sending: Sending }[]) {
    waitingForASlot.current.push(...waiting);
    fillFreeSlots();
  }

  function forget(keys: string[]) {
    for (const key of keys) {
      sendingByKey.current.delete(key);
    }

    waitingForASlot.current = waitingForASlot.current.filter(
      ({ key }) => !keys.includes(key),
    );
    setQueuedKeys(new Set(waitingForASlot.current.map(({ key }) => key)));
  }

  function pick(picked: File[], into = folderId) {
    const keyed = picked.map((file) => ({
      key: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      file,
    }));
    const uploads = pickedUploads(keyed);

    apply({ kind: 'picked', uploads });

    const started = keyed.filter(({ key }) =>
      uploads.some(
        (upload) => upload.key === key && upload.state.kind === 'uploading',
      ),
    );

    for (const { key, file } of started) {
      sendingByKey.current.set(key, { file, into });
    }

    waitForASlot(
      started.map(({ key, file }) => ({ key, sending: { file, into } })),
    );

    return started.map(({ key, file }) => ({ key, file }));
  }

  async function register(
    { key, name, uploadId }: ReturnType<typeof heldUploads>[number],
    keepAsZip: boolean,
  ): Promise<
    | { kind: 'answered'; answer: ActionResult<string[]> }
    | { kind: 'crashed'; error: unknown }
  > {
    let answer;

    try {
      answer = await registerUpload({
        uploadId,
        keepAsZip: isZip(name) && keepAsZip,
      });
    } catch (error) {
      apply({ kind: 'failed', key });

      return { kind: 'crashed', error };
    }

    apply(
      answer.ok
        ? { kind: 'attached', key, documentIds: answer.value }
        : { kind: 'refused', key, message: answer.refusal },
    );

    return { kind: 'answered', answer };
  }

  function clear() {
    cancelWaiting(heldUploads(queueNow.current));
    forget(queueNow.current.map((upload) => upload.key));
    apply({ kind: 'cleared' });
  }

  return {
    queue,
    queuedKeys,
    announcement,
    announce: setAnnouncement,
    pick,
    replaceWithFirst(picked: File[]) {
      clear();
      pick(picked.slice(0, 1));
    },
    async registerHeldUploads(
      keepAsZip: boolean,
    ): Promise<ActionResult<string[]>> {
      const documentIds = attachedDocumentIds(queueNow.current);

      for (const held of heldUploads(queueNow.current)) {
        const registered = await register(held, keepAsZip);

        if (registered.kind === 'crashed') {
          throw registered.error;
        }

        if (!registered.answer.ok) {
          return registered.answer;
        }

        documentIds.push(...registered.answer.value);
      }

      return { ok: true, value: documentIds };
    },
    registerHeldUpload(key: string, keepAsZip: boolean) {
      const held = heldUploads(queueNow.current).find(
        (upload) => upload.key === key,
      );

      if (held) {
        void register(held, keepAsZip);
      }
    },
    retry(key: string) {
      apply({ kind: 'retried', key });
      waitForASlot([{ key, sending: sendingByKey.current.get(key)! }]);
    },
    remove(key: string) {
      for (const { uploadId } of heldUploads(queueNow.current).filter(
        (upload) => upload.key === key,
      )) {
        void cancelUpload({ uploadId });
      }

      forget([key]);
      apply({ kind: 'removed', key });
    },
    clear,
  };
}

export type Uploads = ReturnType<typeof useUploads>;

export function useFileDrop(onPick: (files: File[]) => void) {
  const [isOver, setIsOver] = useState(false);

  return {
    isOver,
    dropProps: {
      onDragOver(event: DragEvent) {
        event.preventDefault();
        setIsOver(true);
      },
      onDragLeave() {
        setIsOver(false);
      },
      onDrop(event: DragEvent) {
        event.preventDefault();
        setIsOver(false);
        onPick(Array.from(event.dataTransfer.files));
      },
    },
  };
}

export function AttachButton({
  onPick,
  multiple,
  buttonRef,
  children,
}: {
  onPick: (files: File[]) => void;
  multiple: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type={'file'}
        multiple={multiple}
        hidden
        aria-label={typeof children === 'string' ? children : undefined}
        onChange={(event) => {
          onPick(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <Button
        ref={buttonRef}
        type={'button'}
        variant={'ghost'}
        size={'sm'}
        onClick={() => input.current?.click()}
      >
        <PaperclipIcon />
        {children}
      </Button>
    </>
  );
}

const rowButton =
  'text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] sm:size-7';

export function UploadList({
  queue,
  onRemove,
  onRetry,
  focusAfterLast,
  finishedWording,
  queuedKeys,
  signInPath,
}: {
  queue: QueuedUpload[];
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  finishedWording?: string;
  queuedKeys?: ReadonlySet<string>;
  focusAfterLast?: RefObject<HTMLElement | null>;
  signInPath?: string;
}) {
  if (queue.length === 0) {
    return null;
  }

  return (
    <ul className={'flex flex-col gap-1'} aria-label={'Files'}>
      {queue.map((upload) => {
        const status = uploadStatus(upload);

        return (
          <li
            key={upload.key}
            className={
              'bg-muted/60 flex items-center gap-2 rounded-md py-0.5 pr-1 pl-2.5 text-sm'
            }
          >
            <FileIcon className={'text-muted-foreground size-4 shrink-0'} />
            <div
              className={
                'flex min-w-0 flex-1 flex-col py-1 sm:flex-row sm:gap-3'
              }
            >
              {status.text.includes(upload.name) ? null : (
                <span className={'truncate font-medium'}>{upload.name}</span>
              )}
              {status.tone === 'problem' ? (
                <RefusalNote refusal={status.text} signInPath={signInPath} />
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-xs sm:text-sm',
                    status.tone === 'done'
                      ? 'text-success'
                      : 'text-muted-foreground',
                  )}
                >
                  {status.tone === 'done' ? (
                    <CheckIcon className={'size-3'} />
                  ) : queuedKeys?.has(upload.key) ? null : (
                    <Spinner className={'size-3'} />
                  )}
                  {upload.state.kind === 'attached'
                    ? (finishedWording ?? status.text)
                    : queuedKeys?.has(upload.key)
                      ? 'Queued'
                      : status.text}
                </span>
              )}
            </div>
            {status.canRetry && onRetry ? (
              <button
                type={'button'}
                className={rowButton}
                aria-label={`Try ${upload.name} again`}
                onClick={() => onRetry(upload.key)}
              >
                <RotateCwIcon className={'size-4'} />
              </button>
            ) : null}
            {status.tone === 'working' ? null : (
              <button
                type={'button'}
                data-remove
                className={rowButton}
                aria-label={`Remove ${upload.name}`}
                onClick={(event) => {
                  const next =
                    event.currentTarget
                      .closest('li')
                      ?.nextElementSibling?.querySelector<HTMLElement>(
                        '[data-remove]',
                      ) ?? focusAfterLast?.current;

                  onRemove(upload.key);
                  next?.focus();
                }}
              >
                <XIcon className={'size-4'} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function KeepAsZipTick({
  queue,
  isTicked,
  onTick,
}: {
  queue: QueuedUpload[];
  isTicked: boolean;
  onTick: (isTicked: boolean) => void;
}) {
  if (!offersKeepAsZip(queue)) {
    return null;
  }

  return (
    <div className={'flex flex-col px-1 text-sm'}>
      <label className={'flex min-h-6 w-fit cursor-pointer items-center gap-2'}>
        <input
          type={'checkbox'}
          className={'accent-primary size-6'}
          checked={isTicked}
          onChange={(event) => onTick(event.target.checked)}
        />
        Keep this zip as one file
      </label>
      <span className={'text-muted-foreground pl-8'}>
        Otherwise it is unpacked into a folder.
      </span>
    </div>
  );
}

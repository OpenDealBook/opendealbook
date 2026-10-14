'use client';

import { useState } from 'react';

import { DownloadIcon, FileIcon, FileXIcon } from 'lucide-react';

import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Message, MessageContent } from '@odb/ui/chat-message';
import { Conversation, ConversationContent } from '@odb/ui/conversation';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';
import { cn } from '@odb/ui/utils';

import {
  closeAskAsLender,
  editAsk,
  replyToAskAsLender,
  withdrawAsk,
} from '../asks/lender-actions';
import { fileUrl } from '../browser/file-access';
import { FilePreviewDialog } from '../browser/file-preview-dialog';
import {
  changeReturnRoute,
  closeFormAsLender,
  editForm,
  replaceBlankForm,
  replyToFormAsLender,
  withdrawForm,
} from '../forms/lender-actions';
import { AttemptDialog, AttemptForm } from './attempt-dialog';
import { LocalTime } from './local-time';
import { MessageWithAttachments } from './message-with-attachments';
import { offeredMoves } from './offered-moves';
import { ReturnRouteChoice, offeredRoute } from './return-route-choice';
import { SingleFilePicker } from './single-file-picker';
import type { ThreadEntry, ThreadFile } from './thread';
import { hasUsableUpload, sendBlocker } from './upload-queue';
import { useUploads } from './uploads';
import {
  confirmWording,
  offersRouteChange,
  replaceBlocker,
  teamNameAtStart,
} from './wording';

export const REQUEST_TITLE_ID = 'request-title';

type Request = Pick<
  Tables<'lender_ask'>,
  | 'kind'
  | 'id'
  | 'title'
  | 'body'
  | 'status'
  | 'first_response_at'
  | 'return_route'
>;

interface Reply {
  body?: string;
  documentIds: string[];
}

const sendReply = {
  ask: (askId: string, reply: Reply) => replyToAskAsLender({ askId, ...reply }),
  form: (formId: string, reply: Reply) =>
    replyToFormAsLender({ formId, ...reply }),
};

const sendMove = {
  ask: {
    withdraw: (askId: string) => withdrawAsk({ askId }),
    close: (askId: string) => closeAskAsLender({ askId }),
  },
  form: {
    withdraw: (formId: string) => withdrawForm({ formId }),
    close: (formId: string) => closeFormAsLender({ formId }),
  },
};

function focusRequestTitle() {
  document.getElementById(REQUEST_TITLE_ID)?.focus();
}

function EditRequest({ request }: { request: Request }) {
  return (
    <AttemptDialog openLabel={'Edit'} title={'Edit this request'}>
      <AttemptForm
        confirmLabel={'Save changes'}
        action={(fields) => {
          const title = String(fields.get('title'));
          const body = String(fields.get('body'));

          return request.kind === 'ask'
            ? editAsk({ askId: request.id, title, ...(body ? { body } : {}) })
            : editForm({
                formId: request.id,
                title,
                ...(body ? { note: body } : {}),
              });
        }}
      >
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'request-title-field'}>Title</Label>
          <Input
            id={'request-title-field'}
            name={'title'}
            defaultValue={request.title}
            required
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'request-body-field'}>
            {request.kind === 'ask' ? 'Detail (optional)' : 'Note (optional)'}
          </Label>
          <Textarea
            id={'request-body-field'}
            name={'body'}
            defaultValue={request.body ?? ''}
          />
        </div>
      </AttemptForm>
    </AttemptDialog>
  );
}

function ConfirmMove({
  move,
  openLabel,
  request,
  dealName,
}: {
  move: 'withdraw' | 'close';
  openLabel: string;
  request: Request;
  dealName: string | null;
}) {
  const wording = confirmWording(move, dealName);

  return (
    <AttemptDialog
      openLabel={openLabel}
      title={wording.title}
      description={wording.detail}
      focusAfterSending={focusRequestTitle}
    >
      <AttemptForm
        confirmLabel={wording.confirm}
        action={() => sendMove[request.kind][move](request.id)}
      />
    </AttemptDialog>
  );
}

function ReplaceFileFields({
  roomId,
  privateFolderId,
  formId,
  returnRoute,
}: {
  roomId: string;
  privateFolderId: string;
  formId: string;
  returnRoute: NonNullable<Request['return_route']>;
}) {
  const uploads = useUploads({
    space: { roomId },
    folderId: privateFolderId,
    registerWhen: 'when-sent',
  });
  const [picked] = uploads.queue;

  return (
    <AttemptForm
      confirmLabel={'Use this file'}
      blocker={
        (picked ? replaceBlocker(picked.name, returnRoute) : null) ??
        sendBlocker(uploads.queue)
      }
      canConfirm={hasUsableUpload(uploads.queue)}
      hasUnsentFiles={uploads.queue.length > 0}
      action={async () => {
        const files = await uploads.registerHeldUploads(true);

        return files.ok
          ? replaceBlankForm({ formId, documentId: files.value[0]! })
          : files;
      }}
    >
      <SingleFilePicker uploads={uploads} chooseLabel={'Choose the new file'} />
    </AttemptForm>
  );
}

function ChangeRouteFields({
  formId,
  fileName,
  returnRoute,
  dealName,
}: {
  formId: string;
  fileName: string;
  returnRoute: NonNullable<Request['return_route']>;
  dealName: string | null;
}) {
  const [chosen, setChosen] = useState(returnRoute);

  return (
    <AttemptForm
      confirmLabel={'Save'}
      action={() =>
        changeReturnRoute({
          formId,
          returnRoute: offeredRoute(fileName, chosen, true),
        })
      }
    >
      <ReturnRouteChoice
        fileName={fileName}
        screen={'change'}
        dealName={dealName}
        chosen={chosen}
        onChoose={setChosen}
      />
    </AttemptForm>
  );
}

export function RequestActions({
  roomId,
  privateFolderId,
  dealName,
  esignAvailable,
  request,
  formFile,
}: {
  roomId: string;
  privateFolderId: string;
  dealName: string | null;
  esignAvailable: boolean;
  request: Request;
  formFile?: ThreadFile;
}) {
  const offered = offeredMoves(request);

  return (
    <div className={'flex flex-wrap gap-2 sm:justify-end'}>
      {offered.includes('edit') ? <EditRequest request={request} /> : null}
      {offered.includes('edit') && request.return_route ? (
        <>
          <AttemptDialog
            openLabel={'Replace file'}
            title={'Replace the form file'}
            description={
              'The new file becomes the form to complete. The earlier file stays in the thread, marked Replaced.'
            }
          >
            <ReplaceFileFields
              roomId={roomId}
              privateFolderId={privateFolderId}
              formId={request.id}
              returnRoute={request.return_route}
            />
          </AttemptDialog>
          {formFile?.isAvailable &&
          offersRouteChange(esignAvailable, request.return_route) ? (
            <AttemptDialog
              openLabel={'Change how it is returned'}
              title={'Change how it is returned'}
              description={`For ${formFile.name}`}
            >
              <ChangeRouteFields
                formId={request.id}
                fileName={formFile.name}
                returnRoute={request.return_route}
                dealName={dealName}
              />
            </AttemptDialog>
          ) : null}
        </>
      ) : null}
      {offered.includes('withdraw') ? (
        <ConfirmMove
          move={'withdraw'}
          openLabel={'Withdraw'}
          request={request}
          dealName={dealName}
        />
      ) : null}
      {offered.includes('close') ? (
        <ConfirmMove
          move={'close'}
          openLabel={'Close'}
          request={request}
          dealName={dealName}
        />
      ) : null}
    </div>
  );
}

function ThreadFileChip({
  roomId,
  file,
}: {
  roomId: string;
  file: ThreadFile;
}) {
  const [isPreviewing, setIsPreviewing] = useState(false);

  if (!file.isAvailable) {
    return (
      <li
        className={
          'text-muted-foreground bg-muted/60 flex max-w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-sm'
        }
      >
        <FileXIcon className={'size-4 shrink-0'} />
        {file.notice}
      </li>
    );
  }

  return (
    <li
      className={
        'bg-card flex max-w-full items-stretch rounded-md border text-sm shadow-xs'
      }
    >
      <button
        type={'button'}
        onClick={() => setIsPreviewing(true)}
        className={
          'hover:bg-accent focus-visible:ring-ring/50 flex min-h-11 min-w-0 items-center gap-2 rounded-l-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-[3px] sm:min-h-9'
        }
      >
        <FileIcon className={'text-muted-foreground size-4 shrink-0'} />
        <span className={'truncate font-medium'}>{file.name}</span>
        {file.label ? <Badge variant={'secondary'}>{file.label}</Badge> : null}
      </button>
      {isPreviewing ? (
        <FilePreviewDialog
          roomId={roomId}
          documentId={file.documentId}
          fileName={file.name}
          onClose={() => setIsPreviewing(false)}
        />
      ) : null}
      <a
        href={fileUrl({
          roomId,
          documentId: file.documentId,
          disposition: 'download',
        })}
        target={'_blank'}
        rel={'noopener'}
        aria-label={`Download ${file.name}`}
        className={
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex min-h-11 w-11 shrink-0 items-center justify-center rounded-r-md border-l outline-none focus-visible:ring-[3px] sm:min-h-9 sm:w-9'
        }
      >
        <DownloadIcon className={'size-4'} />
      </a>
    </li>
  );
}

function ReplyBox({
  roomId,
  privateFolderId,
  request,
}: {
  roomId: string;
  privateFolderId: string;
  request: Request;
}) {
  const [body, setBody] = useState('');

  return (
    <MessageWithAttachments
      roomId={roomId}
      privateFolderId={privateFolderId}
      isTyped={body !== ''}
      needsTextOrFile
      sendLabel={'Send reply'}
      sentWording={'Reply sent.'}
      discardWording={'Discard this reply?'}
      send={(documentIds) =>
        sendReply[request.kind](request.id, {
          ...(body ? { body } : {}),
          documentIds,
        })
      }
      onSent={() => setBody('')}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-label={'Reply'}
        aria-describedby={'reply-keys'}
        placeholder={'Write a reply, attach files, or both'}
        rows={1}
        className={
          'placeholder:text-muted-foreground field-sizing-content max-h-60 min-h-9 w-full resize-none bg-transparent px-1 text-base outline-none md:text-sm'
        }
      />
      <span id={'reply-keys'} className={'sr-only'}>
        Enter starts a new line. Control or Command with Enter sends.
      </span>
    </MessageWithAttachments>
  );
}

export function RequestThread({
  roomId,
  privateFolderId,
  lenderName,
  dealName,
  request,
  thread,
  canAct,
}: {
  roomId: string;
  privateFolderId: string;
  lenderName: string;
  dealName: string | null;
  request: Request;
  thread: ThreadEntry[];
  canAct: boolean;
}) {
  return (
    <section className={'flex flex-col gap-4'}>
      <Conversation aria-label={'Messages and files'}>
        <ConversationContent className={'px-0'}>
          {thread.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              Nothing here yet beyond the title.
            </p>
          ) : null}
          {thread.map((entry) => (
            <Message
              key={entry.key}
              role={entry.side === 'lender' ? 'user' : 'assistant'}
              className={cn(
                'flex-col gap-1',
                entry.side === 'lender' ? 'items-end' : 'items-start',
              )}
            >
              <p className={'text-muted-foreground flex gap-2 text-xs'}>
                <span className={'text-foreground font-medium'}>
                  {entry.side === 'lender'
                    ? (entry.authorName ?? lenderName)
                    : teamNameAtStart(dealName)}
                </span>
                <LocalTime at={entry.at} />
              </p>
              {entry.kind === 'message' ? (
                <MessageContent className={'max-w-[min(100%,36rem)]'}>
                  {entry.body}
                </MessageContent>
              ) : (
                <ul
                  className={cn(
                    'flex max-w-full flex-col gap-1.5',
                    entry.side === 'lender' ? 'items-end' : 'items-start',
                  )}
                >
                  {entry.files.map((file) => (
                    <ThreadFileChip
                      key={file.documentId}
                      roomId={roomId}
                      file={file}
                    />
                  ))}
                </ul>
              )}
            </Message>
          ))}
        </ConversationContent>
      </Conversation>

      {canAct && offeredMoves(request).includes('reply') ? (
        <ReplyBox
          roomId={roomId}
          privateFolderId={privateFolderId}
          request={request}
        />
      ) : null}
    </section>
  );
}

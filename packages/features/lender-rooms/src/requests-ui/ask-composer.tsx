'use client';

import { type ReactNode, createContext, useContext, useState } from 'react';

import { FileIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@odb/ui/dialog';
import { Spinner } from '@odb/ui/spinner';

import type { ActionResult } from '../actions/refusal';
import { openAsk } from '../asks/lender-actions';
import { FaqSuggestions } from '../faq-ui/faq-suggestions';
import { GuardedDialog, type OpenedBy, useGuardedDialog } from './discard';
import { MessageWithAttachments } from './message-with-attachments';
import { LiveRegion } from './refusal-note';
import { teamName, teamNameAtStart } from './wording';

interface AskComposerFormProps {
  roomId: string;
  privateFolderId: string;
  dealName: string | null;
  aboutDocument?: { id: string; name: string };
  onSent?: () => void;
  onAnswered?: () => void;
}

const ANSWERED_WORDING = 'Glad that helped.';

type SendingKind = 'ask' | 'form';

interface SendingRequest {
  key: string;
  kind: SendingKind;
  title: string;
  id: string | null;
}

type Track = (
  kind: SendingKind,
  title: string,
  send: () => Promise<ActionResult<string>>,
) => Promise<ActionResult<string>>;

const SendingContext = createContext<{
  rows: SendingRequest[];
  sentTo: string;
  track: Track;
}>({ rows: [], sentTo: '', track: (_kind, _title, send) => send() });

export function SendingRequests({
  sentTo,
  children,
}: {
  sentTo: string;
  children: ReactNode;
}) {
  const [rows, setRows] = useState<SendingRequest[]>([]);

  function drop(key: string) {
    setRows((now) => now.filter((row) => row.key !== key));
  }

  const track: Track = async (kind, title, send) => {
    const key = crypto.randomUUID();

    setRows((now) => [...now, { key, kind, title, id: null }]);

    const result = await send().catch((error: unknown) => {
      drop(key);
      throw error;
    });

    if (result.ok) {
      setRows((now) =>
        now.map((row) =>
          row.key === key ? { ...row, id: result.value } : row,
        ),
      );
    } else {
      drop(key);
    }

    return result;
  };

  return (
    <SendingContext value={{ rows, sentTo, track }}>{children}</SendingContext>
  );
}

export function useSendingRequests() {
  return useContext(SendingContext).track;
}

export function SendingRows({
  kind,
  shownIds,
  emptyMessage,
}: {
  kind: SendingKind;
  shownIds: string[];
  emptyMessage: string;
}) {
  const { rows, sentTo } = useContext(SendingContext);
  const ofKind = rows.filter((row) => row.kind === kind);
  const waiting = ofKind.filter(
    (row) => row.id === null || !shownIds.includes(row.id),
  );
  const latest = ofKind.at(-1);

  return (
    <>
      {shownIds.length + waiting.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>{emptyMessage}</p>
      ) : null}
      {waiting.length === 0 ? null : (
        <ul className={'divide-y rounded-lg border'}>
          {waiting.map((row) => (
            <li
              key={row.key}
              className={'flex items-center gap-4 px-4 py-3 text-sm'}
            >
              <span className={'min-w-0 flex-1 font-medium sm:truncate'}>
                {row.title}
              </span>
              <span
                className={'text-muted-foreground flex items-center gap-1.5'}
              >
                {row.id === null ? <Spinner className={'size-3'} /> : null}
                {row.id === null ? 'Sending' : 'Sent'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {latest && latest.id !== null ? (
        <p role={'status'} className={'text-muted-foreground text-sm'}>
          Sent to {sentTo}
        </p>
      ) : null}
    </>
  );
}

export function AskComposerForm({
  roomId,
  privateFolderId,
  dealName,
  aboutDocument,
  onSent,
  onAnswered,
}: AskComposerFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [wasSuggested, setWasSuggested] = useState(false);
  const [draftNumber, setDraftNumber] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const track = useSendingRequests();
  const prompt = `What do you need from ${teamName(dealName)}?`;

  function startNewDraft() {
    setTitle('');
    setBody('');
    setWasSuggested(false);
  }

  return (
    <>
      <MessageWithAttachments
        key={draftNumber}
        roomId={roomId}
        privateFolderId={privateFolderId}
        isTyped={title !== '' || body !== ''}
        needsTextOrFile={false}
        sendLabel={'Send request'}
        sentWording={'Request sent.'}
        discardWording={'Discard this request?'}
        send={(attachedIds) =>
          track('ask', title, () =>
            openAsk({
              roomId,
              title,
              ...(body ? { body } : {}),
              ...(wasSuggested ? { afterSuggestion: true } : {}),
              documentIds: [
                ...(aboutDocument ? [aboutDocument.id] : []),
                ...attachedIds,
              ],
            }),
          )
        }
        onSent={() => {
          startNewDraft();
          onSent?.();
        }}
      >
        <input
          required
          autoComplete={'off'}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={prompt}
          placeholder={prompt}
          className={
            'placeholder:text-muted-foreground w-full bg-transparent px-1 pt-1 font-serif text-xl outline-none sm:text-2xl'
          }
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label={'Detail (optional)'}
          placeholder={'Detail (optional)'}
          rows={1}
          className={
            'placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent px-1 text-sm outline-none'
          }
        />

        <FaqSuggestions
          roomId={roomId}
          draft={`${title} ${body}`}
          onShown={() => setWasSuggested(true)}
          onAnswered={() => {
            startNewDraft();
            setDraftNumber((number) => number + 1);
            setIsAnswered(true);
            onAnswered?.();
          }}
        />

        {aboutDocument ? (
          <p
            className={
              'bg-secondary text-secondary-foreground flex w-fit max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-sm'
            }
          >
            <FileIcon className={'size-4 shrink-0'} />
            <span className={'truncate'}>About {aboutDocument.name}</span>
          </p>
        ) : null}
      </MessageWithAttachments>
      {isAnswered ? (
        <p role={'status'} className={'text-muted-foreground text-sm'}>
          {ANSWERED_WORDING}
        </p>
      ) : null}
    </>
  );
}

function ComposerInDialog(composer: Omit<AskComposerFormProps, 'onSent'>) {
  const dialog = useGuardedDialog();

  return (
    <>
      <AskComposerForm
        {...composer}
        onSent={dialog.closeAfterSending}
        onAnswered={() => {
          composer.onAnswered?.();
          dialog.closeAfterSending();
        }}
      />
      <Button
        variant={'outline'}
        size={'sm'}
        className={'w-fit'}
        onClick={dialog.requestClose}
      >
        Cancel
      </Button>
    </>
  );
}

export function AskComposer({
  trigger,
  open,
  onOpenChange,
  ...composer
}: Omit<AskComposerFormProps, 'onSent' | 'onAnswered'> & OpenedBy) {
  const [isAnswered, setIsAnswered] = useState(false);

  return (
    <>
      <LiveRegion message={isAnswered ? ANSWERED_WORDING : null} />
      <GuardedDialog
        {...(onOpenChange ? { open, onOpenChange } : { trigger })}
        discardWording={'Discard this request?'}
        className={'gap-3'}
      >
        <DialogHeader>
          <DialogTitle>Request something</DialogTitle>
          <DialogDescription>
            One line is enough. {teamNameAtStart(composer.dealName)} is told
            right away.
          </DialogDescription>
        </DialogHeader>
        <ComposerInDialog
          {...composer}
          onAnswered={() => setIsAnswered(true)}
        />
      </GuardedDialog>
    </>
  );
}

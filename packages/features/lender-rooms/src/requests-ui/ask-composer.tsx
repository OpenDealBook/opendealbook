'use client';

import { useState } from 'react';

import { FileIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@odb/ui/dialog';

import { openAsk } from '../asks/lender-actions';
import { GuardedDialog, type OpenedBy, useGuardedDialog } from './discard';
import { MessageWithAttachments } from './message-with-attachments';
import { teamName, teamNameAtStart } from './wording';

interface AskComposerFormProps {
  roomId: string;
  privateFolderId: string;
  dealName: string | null;
  aboutDocument?: { id: string; name: string };
  onSent?: () => void;
}

export function AskComposerForm({
  roomId,
  privateFolderId,
  dealName,
  aboutDocument,
  onSent,
}: AskComposerFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const prompt = `What do you need from ${teamName(dealName)}?`;

  return (
    <MessageWithAttachments
      roomId={roomId}
      privateFolderId={privateFolderId}
      isTyped={title !== '' || body !== ''}
      needsTextOrFile={false}
      sendLabel={'Send request'}
      sentWording={'Request sent.'}
      discardWording={'Discard this request?'}
      send={(attachedIds) =>
        openAsk({
          roomId,
          title,
          ...(body ? { body } : {}),
          documentIds: [
            ...(aboutDocument ? [aboutDocument.id] : []),
            ...attachedIds,
          ],
        })
      }
      onSent={() => {
        setTitle('');
        setBody('');
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
  );
}

function ComposerInDialog(composer: Omit<AskComposerFormProps, 'onSent'>) {
  const dialog = useGuardedDialog();

  return (
    <>
      <AskComposerForm {...composer} onSent={dialog.closeAfterSending} />
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
}: Omit<AskComposerFormProps, 'onSent'> & OpenedBy) {
  return (
    <GuardedDialog
      {...(onOpenChange ? { open, onOpenChange } : { trigger })}
      discardWording={'Discard this request?'}
      className={'gap-3'}
    >
      <DialogHeader>
        <DialogTitle>Request something</DialogTitle>
        <DialogDescription>
          One line is enough. {teamNameAtStart(composer.dealName)} is told right
          away.
        </DialogDescription>
      </DialogHeader>
      <ComposerInDialog {...composer} />
    </GuardedDialog>
  );
}

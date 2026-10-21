'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { RefusalNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { uploadRefusal } from '@odb/lender-rooms/uploads/allowed.ts';
import { itemAnchor } from '@odb/notifications/relay';
import {
  MAX_MESSAGE_FILES,
  MAX_MESSAGE_LENGTH,
  MESSAGE_TOO_LONG,
  SELLER_COUNSEL_THREAD_BUCKET,
  threadFilePath,
  TOO_MANY_FILES,
} from '@odb/seller-rooms/counsel-thread/files.ts';
import { postSellerCounselMessage } from '@odb/seller-rooms/counsel-thread/thread.ts';
import { useSupabase } from '@odb/supabase/hooks';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useLiveRefresh } from '../../../../../home/_components/use-live-refresh';

export interface SellerCounselMessage {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  files: { id: string; name: string }[];
}

export function SellerCounselThread({
  dealId,
  readOnlyReason,
  messages,
  audience,
  filesPath,
}: {
  dealId: string;
  readOnlyReason: string | null;
  messages: SellerCounselMessage[];
  audience: string;
  filesPath: string;
}) {
  const router = useRouter();
  const supabase = useSupabase();
  const [body, setBody] = useState('');
  const [chosen, setChosen] = useState<File[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  useLiveRefresh('seller_counsel_message', 'deal_id', dealId);

  function send() {
    const refused =
      body.trim().length > MAX_MESSAGE_LENGTH
        ? MESSAGE_TOO_LONG
        : chosen.length > MAX_MESSAGE_FILES
          ? TOO_MANY_FILES
          : chosen.map(uploadRefusal).find(Boolean);

    if (refused) {
      setRefusal(refused);
      return;
    }

    startSending(async () => {
      const files = await Promise.all(
        chosen.map(async (file) => {
          const path = threadFilePath(dealId, file.name);
          const { error } = await supabase.storage
            .from(SELLER_COUNSEL_THREAD_BUCKET)
            .upload(path, file);

          if (error) {
            throw error;
          }

          return { path, size: file.size };
        }),
      );
      const result = await postSellerCounselMessage({ dealId, body, files });

      if (result.ok) {
        setBody('');
        setChosen([]);
        setRefusal(null);
        router.refresh();
      } else {
        setRefusal(result.refusal);
      }
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      {messages.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No messages yet. Write the first one below.
        </p>
      ) : (
        <ol className={'flex flex-col divide-y rounded-lg border'}>
          {messages.map((message) => (
            <li
              key={message.id}
              id={itemAnchor({
                kind: 'seller-counsel-message',
                id: message.id,
              })}
              className={'flex flex-col gap-1.5 p-4'}
            >
              <div className={'flex flex-wrap items-baseline gap-x-2 text-sm'}>
                <span className={'font-medium'}>{message.author_name}</span>
                <span className={'text-muted-foreground'}>
                  <LocalTime at={message.created_at} />
                </span>
              </div>
              <p className={'text-sm whitespace-pre-wrap'}>{message.body}</p>
              {message.files.length > 0 ? (
                <ul className={'flex flex-wrap gap-2 pt-1'}>
                  {message.files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`${filesPath}/${file.id}`}
                        className={
                          'hover:bg-muted inline-flex rounded-md border px-2 py-1 text-sm'
                        }
                      >
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {readOnlyReason ? (
        <p className={'text-muted-foreground text-sm'}>{readOnlyReason}</p>
      ) : (
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'seller-counsel-message'}>Message</Label>
          <Textarea
            id={'seller-counsel-message'}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Label htmlFor={'seller-counsel-files'}>Attach files</Label>
          <Input
            id={'seller-counsel-files'}
            type={'file'}
            multiple
            onChange={(event) => setChosen([...event.target.files!])}
          />
          <p className={'text-muted-foreground text-sm'}>{audience}</p>
          <RefusalNote refusal={refusal} />
          <Button
            type={'button'}
            className={'w-fit'}
            onClick={send}
            disabled={isSending || (body.trim() === '' && chosen.length === 0)}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

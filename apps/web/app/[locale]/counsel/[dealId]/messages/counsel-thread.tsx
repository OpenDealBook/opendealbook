'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { CounselSide } from '@odb/deal-counsel/portal-gate.ts';
import { postCounselMessage } from '@odb/deal-counsel/thread.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { RefusalNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { itemAnchor } from '@odb/notifications/relay';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useLiveRefresh } from '../../../home/_components/use-live-refresh';

export interface CounselMessage {
  id: string;
  author_name: string | null;
  from_team: boolean;
  body: string;
  created_at: string;
}

export type ThreadAudience = { sellerName: string | null } & (
  | { kind: 'counsel'; teamName: string }
  | { kind: 'team' }
);

function audienceNote(side: CounselSide, audience: ThreadAudience): string {
  const hidden = `${audience.sellerName ? `${audience.sellerName} (the seller)` : 'The seller'} cannot see this.`;

  return audience.kind === 'counsel'
    ? `Visible to the buyer's deal team at ${audience.teamName}. They get an email. ${hidden}`
    : `Visible to your deal team and the ${side}'s counsel. The ${side}'s counsel get an email. ${hidden}`;
}

export function CounselThread({
  dealId,
  side,
  title,
  messages,
  audience,
  readOnlyReason = null,
}: {
  dealId: string;
  side: CounselSide;
  title: string;
  messages: CounselMessage[];
  audience: ThreadAudience;
  readOnlyReason?: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const fieldId = `counsel-message-${side}`;

  useLiveRefresh('counsel_message', 'deal_id', dealId);

  function send() {
    startSending(async () => {
      const result = await postCounselMessage({ dealId, side, body });

      if (result.ok) {
        setBody('');
        setRefusal(null);
        router.refresh();
      } else {
        setRefusal(result.refusal);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {messages.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No messages yet.</p>
        ) : (
          <ol className={'flex flex-col gap-3'}>
            {messages.map((message) => (
              <li
                key={message.id}
                id={itemAnchor({ kind: 'counsel-message', id: message.id })}
                className={'flex flex-col gap-1'}
              >
                <div className={'flex items-center gap-2 text-sm'}>
                  <span className={'font-medium'}>{message.author_name}</span>
                  {message.from_team ? (
                    <Badge variant={'secondary'}>Deal team</Badge>
                  ) : null}
                  <span className={'text-muted-foreground'}>
                    <LocalTime at={message.created_at} />
                  </span>
                </div>
                <p className={'text-sm whitespace-pre-wrap'}>{message.body}</p>
              </li>
            ))}
          </ol>
        )}
        {readOnlyReason ? (
          <p className={'text-muted-foreground text-sm'}>{readOnlyReason}</p>
        ) : (
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={fieldId}>Message</Label>
            <Textarea
              id={fieldId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className={'text-muted-foreground text-sm'}>
              {audienceNote(side, audience)}
            </p>
            <RefusalNote refusal={refusal} />
            <Button
              type={'button'}
              className={'w-fit'}
              onClick={send}
              disabled={isSending || body.trim() === ''}
            >
              Send
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

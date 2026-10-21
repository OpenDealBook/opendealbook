'use client';

import { useState, useTransition } from 'react';

import { TEAM_READ_ONLY } from '@odb/next';
import type { SharePermission } from '@odb/templates';
import type { SendToSellerRefusal } from '@odb/templates/delivery';
import { sendToSellerAction } from '@odb/templates/server';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

const PERMISSIONS: SharePermission[] = ['view', 'comment', 'edit'];

type Outcome = { tone: 'done' | 'problem'; text: string } | null;

function refusalText(refusal: SendToSellerRefusal): string {
  switch (refusal.reason) {
    case 'sender-not-set-up':
      return 'Seller email is not set up';
    case 'team-locked':
      return TEAM_READ_ONLY;
    case 'sending-off':
      return 'Sending to sellers is turned off for this team.';
    case 'limit':
      return `This team has sent ${refusal.sent} documents to sellers in the last 24 hours. Try again after ${new Date(refusal.retryAfter).toLocaleString()}.`;
  }
}

export function SendToSellerPanel({
  generatedDocumentId,
}: {
  generatedDocumentId: string;
}) {
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isSending, startSending] = useTransition();

  const sellerReady =
    sellerName.trim().length > 0 && sellerEmail.trim().length > 0;

  function edit<Value>(set: (value: Value) => void) {
    return (value: Value) => {
      set(value);
      setOutcome(null);
    };
  }

  function onSend() {
    startSending(async () => {
      try {
        const result = await sendToSellerAction({
          generatedDocumentId,
          recipientName: sellerName,
          recipientEmail: sellerEmail,
          permission,
        });

        setOutcome(
          result.kind === 'sent'
            ? { tone: 'done', text: 'Sent to seller' }
            : { tone: 'problem', text: refusalText(result) },
        );
      } catch {
        setOutcome({
          tone: 'problem',
          text: 'The document was not sent. Try again.',
        });
      }
    });
  }

  return (
    <>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'seller-name'}>Seller name</Label>
        <Input
          id={'seller-name'}
          maxLength={200}
          value={sellerName}
          onChange={(event) => edit(setSellerName)(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'seller-email'}>Seller email</Label>
        <Input
          id={'seller-email'}
          type={'email'}
          value={sellerEmail}
          onChange={(event) => edit(setSellerEmail)(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label>Permission</Label>
        <Select
          value={permission}
          onValueChange={(value) =>
            edit(setPermission)(value as SharePermission)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMISSIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          variant={'outline'}
          onClick={onSend}
          disabled={isSending || !sellerReady}
        >
          {isSending ? 'Sending' : 'Send to seller'}
        </Button>
        {outcome ? (
          <span
            data-send-status
            role={outcome.tone === 'problem' ? 'alert' : 'status'}
            className={
              outcome.tone === 'problem'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
          >
            {outcome.text}
          </span>
        ) : null}
      </div>
    </>
  );
}

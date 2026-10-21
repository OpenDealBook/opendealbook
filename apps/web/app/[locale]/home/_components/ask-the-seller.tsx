'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  askSeller,
  askSellerAboutLenderAsk,
} from '@odb/seller-rooms/questions/actions.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

type Outcome = { tone: 'done' | 'problem'; text: string } | null;

export function AskTheSeller(
  target: { lenderAskId: string } | { dealId: string },
) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isSending, startSending] = useTransition();

  function send() {
    startSending(async () => {
      const wording = { title, body };
      const result =
        'lenderAskId' in target
          ? await askSellerAboutLenderAsk({
              lenderAskId: target.lenderAskId,
              ...wording,
            })
          : await askSeller({ dealId: target.dealId, ...wording });

      if (result.ok) {
        setTitle('');
        setBody('');
        setOutcome({ tone: 'done', text: 'Asked in the seller room' });
        router.refresh();
      } else {
        setOutcome({ tone: 'problem', text: result.refusal });
      }
    });
  }

  if (!isOpen) {
    return (
      <Button
        type={'button'}
        variant={'outline'}
        className={'w-fit'}
        onClick={() => setIsOpen(true)}
      >
        Ask the seller
      </Button>
    );
  }

  return (
    <div className={'flex flex-col gap-2'}>
      {'lenderAskId' in target ? (
        <p className={'text-muted-foreground text-sm'}>
          Write it in your own words. The seller never sees which lender asked.
        </p>
      ) : null}
      <Label htmlFor={'seller-question-title'}>Question for the seller</Label>
      <Input
        id={'seller-question-title'}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Label htmlFor={'seller-question-body'}>Details</Label>
      <Textarea
        id={'seller-question-body'}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          onClick={send}
          disabled={isSending || title.trim() === ''}
        >
          Send to the seller room
        </Button>
        {outcome ? (
          <span
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
    </div>
  );
}

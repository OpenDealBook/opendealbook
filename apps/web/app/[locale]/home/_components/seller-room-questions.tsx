'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { itemAnchor } from '@odb/notifications/relay';
import { forwardSellerAnswer } from '@odb/seller-rooms/questions/actions.ts';
import type { TeamQuestion } from '@odb/seller-rooms/questions/queries.ts';
import { Button } from '@odb/ui/button';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

const STATUS = {
  open: 'Waiting for the seller',
  answered: 'Answered',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
} satisfies Record<TeamQuestion['status'], string>;

function ForwardToLender({ question }: { question: TeamQuestion }) {
  const router = useRouter();
  const sellerFiles = question.files.filter((file) => file.side === 'seller');
  const lastAnswer = question.messages.findLast(
    (message) => message.side === 'seller',
  );
  const [body, setBody] = useState(lastAnswer?.body ?? '');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    new Set(sellerFiles.map((file) => file.documentId)),
  );
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  function toggle(documentId: string) {
    const next = new Set(chosen);

    if (!next.delete(documentId)) {
      next.add(documentId);
    }

    setChosen(next);
  }

  function send() {
    startSending(async () => {
      const result = await forwardSellerAnswer({
        questionId: question.id,
        body,
        documentIds: [...chosen],
      });

      setRefusal(result.ok ? null : result.refusal);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-2'}>
      <Label htmlFor={`forward-${question.id}`}>
        Answer for the lender (edit before sending)
      </Label>
      <Textarea
        id={`forward-${question.id}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {sellerFiles.map((file) => (
        <label
          key={file.documentId}
          className={'flex items-center gap-2 text-sm'}
        >
          <input
            type={'checkbox'}
            checked={chosen.has(file.documentId)}
            onChange={() => toggle(file.documentId)}
          />
          {file.name}
        </label>
      ))}
      <Button
        type={'button'}
        className={'w-fit'}
        onClick={send}
        disabled={isSending}
      >
        Send to the lender
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

export function SellerRoomQuestions({
  questions,
}: {
  questions: TeamQuestion[];
}) {
  return (
    <section className={'flex flex-col gap-3'}>
      <h3 className={'text-sm font-medium'}>Questions in the room</h3>
      {questions.map((question) => (
        <article
          key={question.id}
          id={itemAnchor({ kind: 'seller-question', id: question.id })}
          className={'flex flex-col gap-2 rounded-md border p-3'}
        >
          <header className={'flex flex-wrap items-center gap-2'}>
            <span className={'font-medium'}>{question.title}</span>
            <span className={'text-muted-foreground text-xs'}>
              {STATUS[question.status]}
              {question.fromLenderAsk ? ', from a lender request' : ''}
            </span>
          </header>
          {question.body ? <p className={'text-sm'}>{question.body}</p> : null}
          <ul className={'flex flex-col gap-1 text-sm'}>
            {question.messages.map((message) => (
              <li key={message.id}>
                <span className={'font-medium'}>
                  {message.side === 'seller' ? 'Seller' : 'Team'}:
                </span>{' '}
                {message.body}
              </li>
            ))}
            {question.files.map((file) => (
              <li key={file.documentId}>{file.name}</li>
            ))}
          </ul>
          {question.fromLenderAsk && question.status === 'answered' ? (
            <ForwardToLender question={question} />
          ) : null}
        </article>
      ))}
    </section>
  );
}

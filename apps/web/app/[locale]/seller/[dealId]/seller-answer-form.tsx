'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { answerSellerQuestion } from '@odb/diligence/server';
import { Button } from '@odb/ui/button';
import { Textarea } from '@odb/ui/textarea';

export function SellerAnswerForm({
  questionId,
  loiSigned,
}: {
  questionId: string;
  loiSigned: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answer, setAnswer] = useState('');

  function submit() {
    startTransition(async () => {
      await answerSellerQuestion({ questionId, answer });
      setAnswer('');
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-1.5'}>
      <Textarea
        value={answer}
        disabled={!loiSigned || pending}
        placeholder={'Write your answer'}
        onChange={(event) => setAnswer(event.target.value)}
      />
      {loiSigned ? null : (
        <span className={'text-muted-foreground text-xs'}>
          Answering unlocks after the LOI is signed
        </span>
      )}
      <div>
        <Button
          size={'sm'}
          disabled={!loiSigned || pending || answer.length === 0}
          onClick={submit}
        >
          Answer
        </Button>
      </div>
    </div>
  );
}

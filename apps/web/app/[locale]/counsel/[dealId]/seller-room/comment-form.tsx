'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { RefusalNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { postSellerRoomComment } from '@odb/seller-rooms/comments/actions.ts';
import { Button } from '@odb/ui/button';
import { Textarea } from '@odb/ui/textarea';

export function CommentForm({
  roomId,
  subject,
  label,
}: {
  roomId: string;
  subject: { dr_document_id: string } | { question_id: string };
  label: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPosting, startPosting] = useTransition();

  function post() {
    startPosting(async () => {
      const result = await postSellerRoomComment({ roomId, subject, body });

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
    <div className={'flex flex-col gap-2'}>
      <Textarea
        aria-label={label}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <RefusalNote refusal={refusal} />
      <Button
        type={'button'}
        variant={'outline'}
        className={'w-fit'}
        onClick={post}
        disabled={isPosting || body.trim() === ''}
      >
        Comment
      </Button>
    </div>
  );
}

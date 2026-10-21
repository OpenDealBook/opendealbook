'use client';

import { useState, useTransition } from 'react';

import { useParams, useRouter } from 'next/navigation';

import { itemAnchor } from '@odb/notifications/relay';
import { answerSellerQuestion } from '@odb/seller-rooms/questions/actions.ts';
import type { RoomQuestion } from '@odb/seller-rooms/questions/queries.ts';
import { Button } from '@odb/ui/button';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useLiveRefresh } from '../../../../home/_components/use-live-refresh';

export interface AttachableFile {
  documentId: string;
  name: string;
}

export interface CounselComment {
  id: string;
  question_id: string | null;
  author: string;
  body: string;
}

const ANSWERABLE = new Set<RoomQuestion['status']>(['open', 'answered']);

function AnswerForm({
  question,
  files,
}: {
  question: RoomQuestion;
  files: AttachableFile[];
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
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
      const result = await answerSellerQuestion({
        questionId: question.id,
        body,
        documentIds: [...chosen],
      });

      if (result.ok) {
        setBody('');
        setChosen(new Set());
      }

      setRefusal(result.ok ? null : result.refusal);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-2'}>
      <Label htmlFor={`answer-${question.id}`}>Your answer</Label>
      <Textarea
        id={`answer-${question.id}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {files.length > 0 ? (
        <fieldset className={'flex flex-col gap-1'}>
          <legend className={'text-sm'}>Attach files from the room</legend>
          {files.map((file) => (
            <label
              key={file.documentId}
              className={'flex items-center gap-2 text-sm'}
            >
              <input
                type={'checkbox'}
                aria-label={`Attach ${file.name}`}
                checked={chosen.has(file.documentId)}
                onChange={() => toggle(file.documentId)}
              />
              {file.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button
        type={'button'}
        className={'w-fit'}
        onClick={send}
        disabled={isSending}
      >
        Send answer
      </Button>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

export function RoomQuestions({
  teamName,
  askers,
  questions,
  files,
  comments,
  readOnly = false,
}: {
  teamName: string;
  askers: Record<string, string>;
  questions: RoomQuestion[];
  files: AttachableFile[];
  comments: CounselComment[];
  readOnly?: boolean;
}) {
  const { roomId } = useParams<{ roomId: string }>();

  useLiveRefresh('seller_room_comment', 'room_id', roomId);

  if (questions.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-3'}>
      <h2 className={'text-lg font-semibold'}>Questions from {teamName}</h2>
      {questions.map((question) => (
        <article
          key={question.id}
          id={itemAnchor({ kind: 'seller-question', id: question.id })}
          className={'flex flex-col gap-2 rounded-md border p-3'}
        >
          <h3 className={'font-medium'}>{question.title}</h3>
          <p className={'text-muted-foreground text-xs'}>
            {askers[question.id]}, {teamName}
          </p>
          {question.body ? <p className={'text-sm'}>{question.body}</p> : null}
          <ul className={'flex flex-col gap-1 text-sm'}>
            {question.messages.map((message) => (
              <li key={message.id}>
                <span className={'font-medium'}>
                  {message.side === 'seller' ? 'You' : teamName}:
                </span>{' '}
                {message.body}
              </li>
            ))}
            {question.files.map((file) => (
              <li key={file.documentId}>{file.name}</li>
            ))}
            {comments
              .filter((comment) => comment.question_id === question.id)
              .map((comment) => (
                <li key={comment.id}>
                  <span className={'font-medium'}>{comment.author}:</span>{' '}
                  {comment.body}
                </li>
              ))}
          </ul>
          {!readOnly && ANSWERABLE.has(question.status) ? (
            <AnswerForm question={question} files={files} />
          ) : null}
        </article>
      ))}
    </section>
  );
}

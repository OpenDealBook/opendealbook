'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  addSellerQuestionNote,
  answerSellerQuestion,
  listSellerQuestionNotes,
  poseSellerQuestion,
} from '@odb/diligence/server';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Textarea } from '@odb/ui/textarea';

function dateOrNotSet(value: string | null): string {
  return value === null
    ? 'Not set'
    : new Date(value).toLocaleDateString('en-US');
}

function AnswerControl({
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
        placeholder={'Write an answer'}
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

function PrivateNotesPanel({ questionId }: { questionId: string }) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Tables<'seller_question_note'>[]>([]);
  const [draft, setDraft] = useState('');

  const load = useCallback(() => {
    startTransition(async () => {
      setNotes(await listSellerQuestionNotes({ questionId }));
    });
  }, [questionId]);

  useEffect(() => {
    load();
  }, [load]);

  function add() {
    startTransition(async () => {
      await addSellerQuestionNote({ questionId, note: draft });
      setDraft('');
      setNotes(await listSellerQuestionNotes({ questionId }));
    });
  }

  return (
    <div className={'border-muted mt-1 flex flex-col gap-1.5 border-l-2 pl-3'}>
      <span className={'text-muted-foreground text-xs font-medium uppercase'}>
        Private notes (buyer only)
      </span>
      {notes.length === 0 ? (
        <p className={'text-muted-foreground text-xs'}>No private notes yet</p>
      ) : (
        <ul className={'flex flex-col gap-1'}>
          {notes.map((note) => (
            <li key={note.id} className={'text-sm'}>
              {note.note}
            </li>
          ))}
        </ul>
      )}
      <Textarea
        value={draft}
        disabled={pending}
        placeholder={'Add a private note'}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div>
        <Button
          size={'sm'}
          variant={'outline'}
          disabled={pending || draft.length === 0}
          onClick={add}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}

export function SellerQuestionsSection({
  dealId,
  questions,
  loiSigned,
}: {
  dealId: string;
  questions: Tables<'seller_question'>[];
  loiSigned: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState('');

  function pose() {
    startTransition(async () => {
      await poseSellerQuestion({ dealId, question });
      setQuestion('');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller questions</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <div className={'flex flex-col gap-1.5'}>
          <Textarea
            value={question}
            placeholder={'Pose a question to the seller'}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div>
            <Button
              onClick={pose}
              disabled={pending || question.length === 0}
            >
              Submit
            </Button>
          </div>
        </div>

        {questions.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No questions yet</p>
        ) : (
          <div className={'flex flex-col gap-6'}>
            {questions.map((item) => (
              <div key={item.id} className={'flex flex-col gap-2'}>
                <div className={'flex flex-wrap items-center gap-2'}>
                  <span className={'text-sm'}>{item.question}</span>
                  <Badge variant={'outline'}>{item.status}</Badge>
                </div>
                <div className={'text-muted-foreground text-xs'}>
                  Asked by {item.asked_by ?? 'Unknown'}
                </div>
                {item.answer === null ? (
                  <>
                    <p className={'text-muted-foreground text-sm'}>
                      Not answered yet
                    </p>
                    <AnswerControl
                      questionId={item.id}
                      loiSigned={loiSigned}
                    />
                  </>
                ) : (
                  <div className={'flex flex-col gap-0.5'}>
                    <p className={'text-sm'}>{item.answer}</p>
                    <span className={'text-muted-foreground text-xs'}>
                      Answered {dateOrNotSet(item.answered_at)}
                    </span>
                  </div>
                )}
                <PrivateNotesPanel questionId={item.id} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

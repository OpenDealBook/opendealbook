'use client';

import { useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useFormatter, useLocale, useTranslations } from 'next-intl';

import type { DocumentCitation } from '@odb/ai/citations';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@odb/ui/ai-elements/conversation';
import {
  Message,
  MessageActions,
  MessageContent,
} from '@odb/ui/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@odb/ui/ai-elements/prompt-input';
import { Button } from '@odb/ui/button';
import { Spinner } from '@odb/ui/spinner';
import { cn } from '@odb/ui/utils';

import type {
  DealQuestionErrorCode,
  DealQuestionStreamError,
} from '../../../api/ai/deal-question/codes';
import type { Progress } from '../../../api/ai/deal-question/progress';
import { deleteDealAiQuestion } from '../[account]/deals/[id]/ask/actions';
import { AiAnswer } from './ai-citation';
import { PromoteToFaqDialog } from './promote-to-faq-dialog';

export interface AskedQuestion {
  id: string;
  thread_id: string;
  asked_by: string | null;
  question: string;
  answer: string | null;
  status: 'running' | 'answered' | 'credits_ran_out' | 'failed';
  citations: DocumentCitation[];
  created_at: string;
  finished_at: string | null;
}

export type FinishedQuestion = Omit<AskedQuestion, 'asked_by'> & {
  credits_used: number;
};

type QuestionEvent =
  | { event: 'progress'; data: Progress }
  | { event: 'done'; data: FinishedQuestion }
  | { event: 'error'; data: { code: DealQuestionStreamError } };

const STALE_AFTER_MS = 10 * 60_000;
const QUESTION_MAX_LENGTH = 4000;
const THREAD_MAX_QUESTIONS = 20;

const ERRORS: Record<DealQuestionErrorCode, string> = {
  unauthenticated: 'errors.signedOut',
  invalid_request: 'errors.unknown',
  empty_question: 'errors.empty',
  question_too_long: 'tooLong',
  unknown_locale: 'errors.unknown',
  deal_not_found: 'errors.dealNotFound',
  not_deal_team: 'errors.notOnTeam',
  team_read_only: 'readOnly',
  thread_not_found: 'errors.threadNotFound',
  connect_ai_provider: 'errors.connectProvider',
  already_running: 'errors.alreadyRunning',
  thread_full: 'threadFull',
  save_failed: 'errors.notSaved',
};

async function* questionEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<QuestionEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffered += decoder.decode(value, { stream: true });
    const blocks = buffered.split('\n\n');
    buffered = blocks.pop()!;
    for (const block of blocks) {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      if (event === undefined) {
        continue;
      }
      const [, data] = /^data: (.*)$/m.exec(block)!;
      yield { event, data: JSON.parse(data!) } as QuestionEvent;
    }
  }
}

function asShown(question: AskedQuestion, now: number): AskedQuestion {
  return question.status === 'running' &&
    now - Date.parse(question.created_at) > STALE_AFTER_MS
    ? { ...question, status: 'failed' }
    : question;
}

function byThread(questions: AskedQuestion[]): AskedQuestion[][] {
  const threads = new Map<string, AskedQuestion[]>();
  for (const question of [...questions].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )) {
    threads.set(question.thread_id, [
      ...(threads.get(question.thread_id) ?? []),
      question,
    ]);
  }
  return [...threads.values()].reverse();
}

function progressKey(progress: Progress): string {
  return progress.kind === 'read_pages' && progress.from === progress.to
    ? 'progress.read_page'
    : `progress.${progress.kind}`;
}

export function DealAskPanel({
  dealId,
  viewerId,
  people,
  now,
  questions,
  readable,
  connected,
  readOnly,
  canManage,
  settingsHref,
  initialThreadId,
  showThreadList = true,
  onThreadChange,
}: {
  dealId: string;
  viewerId: string;
  people: Record<string, string>;
  now: number;
  questions: AskedQuestion[];
  readable: Record<string, number>;
  connected: boolean;
  readOnly: boolean;
  canManage: boolean;
  settingsHref: string;
  initialThreadId?: string;
  showThreadList?: boolean;
  onThreadChange?: (threadId: string | null) => void;
}) {
  const t = useTranslations('dealAsk');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [finished, setFinished] = useState<AskedQuestion[]>([]);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const threads = byThread(
    [
      ...questions,
      ...finished.filter(
        (local) => !questions.some((saved) => saved.id === local.id),
      ),
    ]
      .filter((question) => !removed.has(question.id))
      .map((question) => asShown(question, now)),
  );
  const [chosen, setChosen] = useState<string | null>(
    initialThreadId ?? threads[0]?.[0]?.thread_id ?? null,
  );
  const openThread = useRef(chosen);
  const thread =
    threads.find((candidate) => candidate[0]!.thread_id === chosen) ?? [];
  const threadId = thread.length > 0 ? chosen : null;
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState<{
    threadId: string | null;
    question: string;
    progress: Progress | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = thread.length >= THREAD_MAX_QUESTIONS;
  const tooLong = draft.length > QUESTION_MAX_LENGTH;
  const notice = readOnly
    ? t('readOnly')
    : full
      ? t('threadFull')
      : tooLong
        ? t('tooLong')
        : null;

  function refusal(code: string): string {
    return t(
      Object.hasOwn(ERRORS, code)
        ? ERRORS[code as DealQuestionErrorCode]
        : 'errors.unknown',
    );
  }

  function submit() {
    if (draft.trim() && !asking && !notice) {
      void ask(draft);
    }
  }

  function choose(id: string | null) {
    if (id !== openThread.current) {
      openThread.current = id;
      setChosen(id);
      onThreadChange?.(id);
    }
  }

  async function ask(question: string) {
    const from = chosen;
    setError(null);
    setAsking({ threadId, question, progress: null });
    try {
      const response = await fetch('/api/ai/deal-question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dealId,
          question,
          ...(threadId ? { threadId } : {}),
          locale,
        }),
      });
      if (!response.ok) {
        setError(refusal(((await response.json()) as { code: string }).code));
      } else {
        setDraft('');
        for await (const { event, data } of questionEvents(response.body!)) {
          if (event === 'progress') {
            setAsking({ threadId, question, progress: data });
          } else if (event === 'done') {
            setFinished((local) => [...local, { ...data, asked_by: viewerId }]);
            if (openThread.current === from) {
              choose(data.thread_id);
            }
          } else {
            setError(refusal(data.code));
          }
        }
      }
    } catch {
      setError(t('connectionLost'));
    }
    setAsking(null);
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const deleted = await deleteDealAiQuestion({ id }).catch(() => false);
    if (deleted) {
      setRemoved((ids) => new Set(ids).add(id));
      if (thread.every((question) => question.id === id)) {
        choose(null);
      }
      router.refresh();
    } else {
      setError(t('deleteRefused'));
    }
  }

  function answerOf(question: AskedQuestion) {
    switch (question.status) {
      case 'answered':
        return (
          <AiAnswer
            dealId={dealId}
            text={question.answer!}
            citations={question.citations}
            readable={readable}
          />
        );
      case 'credits_ran_out':
        return t('creditsRanOut');
      case 'failed':
        return question.answer ?? t('stopped');
      case 'running':
        return t('stillWorking');
    }
  }

  return (
    <div
      className={cn(
        'grid min-h-[32rem] gap-4 lg:gap-6',
        showThreadList && 'lg:grid-cols-[18rem_minmax(0,1fr)]',
      )}
    >
      {showThreadList ? (
        <aside className={'flex flex-col gap-2'}>
          <div className={'flex items-center justify-between gap-2'}>
            <h2 className={'text-sm font-medium'}>{t('threads')}</h2>
            <Button
              type={'button'}
              variant={'outline'}
              size={'sm'}
              onClick={() => choose(null)}
            >
              {t('newThread')}
            </Button>
          </div>
          {threads.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              {t('noQuestions')}
            </p>
          ) : (
            <ul
              className={
                'flex max-h-48 flex-col gap-1 overflow-y-auto lg:max-h-[36rem]'
              }
            >
              {threads.map((candidate) => {
                const first = candidate[0]!;
                return (
                  <li key={first.thread_id}>
                    <button
                      type={'button'}
                      aria-current={
                        first.thread_id === threadId ? 'true' : undefined
                      }
                      onClick={() => choose(first.thread_id)}
                      className={
                        'hover:bg-muted aria-[current]:bg-muted flex w-full flex-col rounded-md px-3 py-2 text-left text-sm'
                      }
                    >
                      <span className={'line-clamp-2'}>{first.question}</span>
                      <span className={'text-muted-foreground text-xs'}>
                        {format.dateTime(
                          new Date(candidate.at(-1)!.created_at),
                          {
                            dateStyle: 'medium',
                          },
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      ) : null}
      <section className={'flex min-h-0 flex-col gap-3 rounded-lg border'}>
        <Conversation className={'max-h-[60vh] min-h-64'}>
          <ConversationContent>
            {thread.map((question) => (
              <div
                key={question.id}
                data-question
                className={'flex flex-col gap-2'}
              >
                <p
                  data-asked-by
                  className={'text-muted-foreground text-right text-xs'}
                >
                  {t('askedBy', {
                    name:
                      (question.asked_by && people[question.asked_by]) ||
                      t('formerMember'),
                    when: format.dateTime(new Date(question.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
                <Message from={'user'}>
                  <MessageContent className={'whitespace-pre-wrap'}>
                    {question.question}
                  </MessageContent>
                </Message>
                <Message from={'assistant'}>
                  <MessageContent
                    className={cn(
                      question.status !== 'answered' &&
                        'text-muted-foreground flex-row items-center',
                    )}
                  >
                    {question.status === 'running' ? (
                      <Spinner aria-label={t('stillWorking')} />
                    ) : null}
                    {answerOf(question)}
                  </MessageContent>
                  <MessageActions className={'empty:hidden'}>
                    {canManage &&
                    question.status === 'answered' &&
                    !readOnly ? (
                      <PromoteToFaqDialog
                        dealId={dealId}
                        question={question.question}
                        answer={question.answer!}
                        citations={question.citations}
                      />
                    ) : null}
                    {question.asked_by === viewerId &&
                    question.status !== 'running' &&
                    !readOnly ? (
                      <Button
                        type={'button'}
                        variant={'ghost'}
                        size={'sm'}
                        onClick={() => remove(question.id)}
                      >
                        {t('delete')}
                      </Button>
                    ) : null}
                  </MessageActions>
                </Message>
              </div>
            ))}
            {asking && asking.threadId === threadId ? (
              <div className={'flex flex-col gap-2'}>
                <Message from={'user'}>
                  <MessageContent className={'whitespace-pre-wrap'}>
                    {asking.question}
                  </MessageContent>
                </Message>
                <Message from={'assistant'}>
                  <MessageContent
                    className={
                      'text-muted-foreground flex-row items-center text-xs'
                    }
                  >
                    <Spinner aria-label={t('progress.working')} />
                    {asking.progress
                      ? t(progressKey(asking.progress), asking.progress)
                      : null}
                  </MessageContent>
                </Message>
              </div>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton aria-label={t('scrollToLatest')} />
        </Conversation>
        <div className={'flex flex-col gap-2 border-t p-3'}>
          {error ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {error}
            </p>
          ) : null}
          {connected ? (
            <>
              <PromptInput onSubmit={submit}>
                <PromptInputTextarea
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  disabled={readOnly || full}
                  placeholder={t('placeholder')}
                />
                <PromptInputFooter className={'justify-end'}>
                  <PromptInputSubmit
                    size={'sm'}
                    disabled={
                      asking !== null || notice !== null || !draft.trim()
                    }
                  >
                    {t('ask')}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>
              {notice ? (
                <p className={'text-muted-foreground text-sm'}>{notice}</p>
              ) : null}
            </>
          ) : (
            <div
              className={
                'bg-muted/40 flex flex-col items-start gap-2 rounded-md p-4'
              }
            >
              <h3 className={'font-medium'}>{t('connectTitle')}</h3>
              <p className={'text-muted-foreground text-sm'}>
                {t('connectBody')}
              </p>
              <Button asChild size={'sm'}>
                <Link href={settingsHref}>{t('connectAction')}</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

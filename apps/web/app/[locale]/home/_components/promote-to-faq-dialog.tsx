'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import type { List, Nodes, RootContent } from 'mdast';
import { useTranslations } from 'next-intl';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { citationLabel, type DocumentCitation } from '@odb/ai/citations';
import { SESSION_ENDED } from '@odb/lender-rooms/actions/refusal.ts';
import {
  BOTH_REQUIRED,
  DEAL_TEAM_ONLY,
  TOO_LONG,
} from '@odb/lender-rooms/faq/entry-rules.ts';
import { findSimilarFaqEntries } from '@odb/lender-rooms/faq/manage.ts';
import { saveNewFaqEntry } from '@odb/lender-rooms/faq/publish.ts';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { TEAM_READ_ONLY } from '@odb/next';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

const ENTRY_MAX_LENGTH = 5000;

const REFUSALS = new Map([
  [DEAL_TEAM_ONLY, 'promote.notManager'],
  [TOO_LONG, 'promote.tooLong'],
  [BOTH_REQUIRED, 'promote.bothRequired'],
  [TEAM_READ_ONLY, 'readOnly'],
  [SESSION_ENDED, 'errors.signedOut'],
]);

interface Similar {
  question: string;
  matches: { id: string; question: string }[];
}

const markdown = unified().use(remarkParse).use(remarkGfm);

function inline(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value;
    case 'link':
      return `${node.children.map(inline).join('')} (${node.url})`;
    case 'break':
      return '\n';
    case 'image':
    case 'imageReference':
      return node.alt ?? '';
    case 'html':
      return '';
    default:
      return 'children' in node ? node.children.map(inline).join('') : '';
  }
}

function list(node: List, indent: string): string {
  return node.children
    .map((item, index) => {
      const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : '- ';
      const [first, ...rest] = item.children;
      return [
        `${indent}${marker}${first ? block(first, indent) : ''}`,
        ...rest.map((child) =>
          child.type === 'list'
            ? list(child, `${indent}  `)
            : `${indent}  ${block(child, `${indent}  `)}`,
        ),
      ].join('\n');
    })
    .join('\n');
}

function block(node: RootContent, indent: string): string {
  switch (node.type) {
    case 'list':
      return list(node, indent);
    case 'table':
      return node.children
        .map((row) => row.children.map(inline).join(' | '))
        .join('\n');
    case 'code':
      return node.value;
    case 'blockquote':
      return blocks(node.children, indent);
    default:
      return inline(node);
  }
}

function blocks(nodes: RootContent[], indent: string): string {
  return nodes
    .map((node) => block(node, indent))
    .filter(Boolean)
    .join('\n\n');
}

function plainText(source: string): string {
  return blocks(markdown.parse(source).children, '');
}

function withoutLabels(answer: string, citations: DocumentCitation[]) {
  return citations
    .map((citation) => `[${citationLabel(citation)}]`)
    .reduce(
      (text, label) => text.replaceAll(` ${label}`, '').replaceAll(label, ''),
      answer,
    );
}

export function PromoteToFaqDialog({
  dealId,
  question,
  answer,
  citations,
}: {
  dealId: string;
  question: string;
  answer: string;
  citations: DocumentCitation[];
}) {
  const t = useTranslations('dealAsk');
  const { account } = useParams<{ account: string }>();
  const { problem, isPending, attempt } = useAttempt();
  const [isOpen, setIsOpen] = useState(false);
  const [entryId] = useState(() => crypto.randomUUID());
  const [draftQuestion, setDraftQuestion] = useState(() =>
    question.slice(0, ENTRY_MAX_LENGTH),
  );
  const [draftAnswer, setDraftAnswer] = useState(() =>
    plainText(withoutLabels(answer, citations)).slice(0, ENTRY_MAX_LENGTH),
  );
  const [similar, setSimilar] = useState<Similar | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    attempt(
      async () => {
        if (
          draftQuestion.trim() !== '' &&
          similar?.question !== draftQuestion
        ) {
          const found = await findSimilarFaqEntries({
            dealId,
            query: draftQuestion,
          });

          if (!found.ok) {
            return found;
          }

          const matches = found.value;
          const hasSimilarEntries = matches.length > 0;

          if (hasSimilarEntries) {
            setSimilar({ question: draftQuestion, matches });
            return found;
          }
        }

        const result = await saveNewFaqEntry({
          entryId,
          dealId,
          askIds: [],
          question: draftQuestion,
          answer: draftAnswer,
          status: 'draft',
          files: [],
        });

        if (result.ok) {
          setSaved(true);
          setIsOpen(false);
        }

        return result;
      },
      () => {},
    );
  }

  if (saved) {
    return (
      <p role={'status'} className={'text-muted-foreground text-sm'}>
        {t('promote.saved')}{' '}
        <Link
          href={`/home/${account}/deals/${dealId}/lenders/faq`}
          className={'text-foreground underline'}
        >
          {t('promote.viewFaq')}
        </Link>
      </p>
    );
  }

  return (
    <>
      <Button
        type={'button'}
        variant={'ghost'}
        size={'sm'}
        onClick={() => setIsOpen(true)}
      >
        {t('promote.open')}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className={'sm:max-w-2xl'}>
          <DialogHeader>
            <DialogTitle>{t('promote.title')}</DialogTitle>
            <DialogDescription>{t('promote.description')}</DialogDescription>
          </DialogHeader>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'promote-question'}>{t('promote.question')}</Label>
            <Textarea
              id={'promote-question'}
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'promote-answer'}>{t('promote.answer')}</Label>
            <Textarea
              id={'promote-answer'}
              className={'min-h-32'}
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
            />
          </div>
          {similar ? (
            <section
              className={
                'bg-muted/50 flex flex-col gap-2 rounded-md border p-3 text-sm'
              }
            >
              <p className={'font-medium'}>{t('promote.similar')}</p>
              <ul className={'text-muted-foreground list-disc pl-5'}>
                {similar.matches.map((match) => (
                  <li key={match.id} className={'whitespace-pre-line'}>
                    {match.question}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {problem ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {t(
                (problem.kind === 'refused' && REFUSALS.get(problem.refusal)) ||
                  'promote.failed',
              )}
            </p>
          ) : null}
          <DialogFooter>
            <Button type={'button'} disabled={isPending} onClick={save}>
              {t('promote.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { useState } from 'react';

import Link from 'next/link';

import { findSimilarFaqEntries } from '@odb/lender-rooms/faq/manage.ts';
import { saveNewFaqEntry } from '@odb/lender-rooms/faq/publish.ts';
import {
  LiveRegion,
  ProblemNote,
} from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { teamSignInPath } from './lender-wording';

export interface FaqPrefill {
  question: string;
  answer: string;
  files: { askFileId: string; name: string }[];
}

type SaveAs = 'draft' | 'published';

const savedWording: Record<SaveAs, string> = {
  draft: 'Saved to the FAQ as a draft.',
  published: 'Published to the FAQ.',
};

interface Similar {
  question: string;
  matches: { id: string; question: string }[];
}

export function LenderFaqAdd({
  dealId,
  askId,
  faqPath,
  prefill,
}: {
  dealId: string;
  askId: string;
  faqPath: string;
  prefill: FaqPrefill;
}) {
  const { problem, isPending, attempt } = useAttempt();
  const [isOpen, setIsOpen] = useState(false);
  const [entryId] = useState(() => crypto.randomUUID());
  const [question, setQuestion] = useState(prefill.question);
  const [answer, setAnswer] = useState(prefill.answer);
  const [files, setFiles] = useState(
    prefill.files.map((file) => ({
      ...file,
      original: file.name,
      chosen: true,
    })),
  );
  const [similar, setSimilar] = useState<Similar | null>(null);
  const [savedAs, setSavedAs] = useState<SaveAs | null>(null);

  function editFile(
    askFileId: string,
    change: Partial<(typeof files)[number]>,
  ) {
    setFiles((current) =>
      current.map((file) =>
        file.askFileId === askFileId ? { ...file, ...change } : file,
      ),
    );
  }

  function save(status: SaveAs) {
    attempt(
      async () => {
        if (question.trim() !== '' && similar?.question !== question) {
          const found = await findSimilarFaqEntries({
            dealId,
            query: question,
          });

          if (!found.ok) {
            return found;
          }

          if (found.value.length > 0) {
            setSimilar({
              question,
              matches: found.value,
            });
            return found;
          }
        }

        const saved = await saveNewFaqEntry({
          entryId,
          dealId,
          askIds: [askId],
          question,
          answer,
          status,
          files: files
            .filter((file) => file.chosen)
            .map(({ askFileId, name }) => ({ askFileId, name })),
        });

        if (saved.ok) {
          setSavedAs(status);
          setIsOpen(false);
        }

        return saved;
      },
      () => {},
    );
  }

  return (
    <div className={'flex flex-wrap items-center gap-3 text-sm'}>
      {savedAs ? null : (
        <Button variant={'outline'} onClick={() => setIsOpen(true)}>
          Add to FAQ
        </Button>
      )}
      <LiveRegion message={savedAs ? savedWording[savedAs] : null} />
      {savedAs ? (
        <span className={'text-muted-foreground'}>
          {savedWording[savedAs]}{' '}
          <Link href={faqPath} className={'text-foreground underline'}>
            Manage the FAQ
          </Link>
        </span>
      ) : null}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className={'sm:max-w-2xl'}>
          <DialogHeader>
            <DialogTitle>Add to the FAQ</DialogTitle>
            <DialogDescription>
              A published entry shows in every lender room on this deal. Reword
              it so it reads well without this thread; no lender sees who asked.
            </DialogDescription>
          </DialogHeader>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'faq-question'}>Question</Label>
            <Textarea
              id={'faq-question'}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'faq-answer'}>Answer</Label>
            <Textarea
              id={'faq-answer'}
              className={'min-h-32'}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </div>
          {files.length > 0 ? (
            <fieldset className={'flex flex-col gap-2'}>
              <legend className={'mb-2 text-sm font-medium'}>
                Our answer files
              </legend>
              {files.map((file) => (
                <div key={file.askFileId} className={'flex items-center gap-3'}>
                  <Checkbox
                    aria-label={`Include ${file.original}`}
                    checked={file.chosen}
                    onCheckedChange={(checked) =>
                      editFile(file.askFileId, { chosen: checked === true })
                    }
                  />
                  <Input
                    aria-label={`Name for ${file.original}`}
                    value={file.name}
                    disabled={!file.chosen}
                    onChange={(event) =>
                      editFile(file.askFileId, { name: event.target.value })
                    }
                  />
                </div>
              ))}
            </fieldset>
          ) : null}
          {similar ? (
            <section
              className={
                'bg-muted/50 flex flex-col gap-2 rounded-md border p-3 text-sm'
              }
            >
              <p className={'font-medium'}>
                The FAQ already has entries like this one
              </p>
              <ul className={'text-muted-foreground list-disc pl-5'}>
                {similar.matches.map((match) => (
                  <li key={match.id} className={'whitespace-pre-line'}>
                    {match.question}
                  </li>
                ))}
              </ul>
              <p className={'text-muted-foreground'}>
                Save or publish again to add yours anyway.
              </p>
            </section>
          ) : null}
          <ProblemNote problem={problem} signInPath={teamSignInPath} />
          <DialogFooter>
            <Button
              variant={'outline'}
              disabled={isPending}
              onClick={() => save('draft')}
            >
              Save draft
            </Button>
            <Button disabled={isPending} onClick={() => save('published')}>
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

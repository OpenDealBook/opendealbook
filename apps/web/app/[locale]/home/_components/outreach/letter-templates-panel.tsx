'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { TEMPLATE_LETTER_FIELDS } from '@odb/outreach-app';
import { createLetterTemplate, updateLetterTemplate } from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { MergeFieldPicker } from './merge-field-picker';

export interface LetterTemplate {
  id: string;
  name: string;
  body: string;
}

type Draft = { templateId: string | null; name: string; body: string };

export function LetterTemplatesPanel({
  accountId,
  templates,
}: {
  accountId: string;
  templates: LetterTemplate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null) {
      return;
    }

    const template = { accountId, name: draft.name, body: draft.body };
    setError(null);
    startTransition(async () => {
      try {
        if (draft.templateId === null) {
          await createLetterTemplate(template);
        } else {
          const result = await updateLetterTemplate({ ...template, templateId: draft.templateId });
          if (!result.ok) {
            setError(result.refusal);
            return;
          }
        }
        setDraft(null);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Something broke');
      }
    });
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div>
        <Button
          type={'button'}
          size={'sm'}
          onClick={() => setDraft({ templateId: null, name: '', body: '' })}
        >
          New letter template
        </Button>
      </div>

      {templates.length === 0 && draft === null ? (
        <p className={'text-muted-foreground text-sm'}>No letter templates yet.</p>
      ) : null}

      <div className={'flex flex-col gap-3'}>
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader className={'flex-row items-center justify-between'}>
              <CardTitle className={'text-base'}>{template.name}</CardTitle>
              <Button
                type={'button'}
                size={'sm'}
                variant={'outline'}
                onClick={() =>
                  setDraft({ templateId: template.id, name: template.name, body: template.body })
                }
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              <p className={'text-muted-foreground text-sm whitespace-pre-wrap'}>
                {template.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {draft !== null ? (
        <Card>
          <CardHeader>
            <CardTitle className={'text-base'}>
              {draft.templateId === null ? 'New letter template' : 'Edit letter template'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className={'flex flex-col gap-4'}>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'letter-template-name'}>Name</Label>
                <Input
                  id={'letter-template-name'}
                  required
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>

              <div className={'flex flex-col gap-2'}>
                <div className={'flex items-center justify-between'}>
                  <Label htmlFor={'letter-template-body'}>Letter</Label>
                  <MergeFieldPicker
                    fieldId={'letter-template-body'}
                    tokens={TEMPLATE_LETTER_FIELDS}
                    value={draft.body}
                    onChange={(body) => setDraft({ ...draft, body })}
                  />
                </div>
                <Textarea
                  id={'letter-template-body'}
                  required
                  rows={10}
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </div>

              {error !== null ? <p className={'text-destructive text-sm'}>{error}</p> : null}

              <div className={'flex gap-2'}>
                <Button type={'submit'} disabled={pending}>
                  {pending ? 'Saving...' : 'Save letter template'}
                </Button>
                <Button type={'button'} variant={'outline'} onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

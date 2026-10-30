'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type {
  FieldSource,
  FieldType,
  TemplateFieldDraft,
  TemplateType,
} from '@odb/templates';
import {
  beginTemplateUpload,
  parseTemplateDocx,
  saveTemplate,
} from '@odb/templates/server';
import { TEMPLATES_BUCKET } from '@odb/templates/storage';
import { getSupabaseBrowserClient } from '@odb/supabase/client';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { TEMPLATE_TYPE_LABELS } from './template-type-labels';

const FIELD_TYPES: FieldType[] = [
  'text',
  'currency',
  'date',
  'percent',
  'list',
];
const FIELD_SOURCES: FieldSource[] = ['deal', 'firm', 'account', 'manual'];

interface TemplateAuthoringProps {
  accountId: string;
  listHref: string;
}

export function TemplateAuthoring({
  accountId,
  listHref,
}: TemplateAuthoringProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<TemplateType>('loi');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<TemplateFieldDraft[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isSaving, startSaving] = useTransition();

  function reportingFailure(work: () => Promise<void>) {
    return async () => {
      setFailure(null);

      try {
        await work();
      } catch (error) {
        setFailure((error as Error).message);
      }
    };
  }

  function onFile(file: File) {
    setTemplateId(null);
    setDrafts([]);
    startParsing(
      reportingFailure(async () => {
        const begun = await beginTemplateUpload({ accountId, size: file.size });

        if (!begun.ok) {
          throw new Error(begun.refusal);
        }

        const stored = await getSupabaseBrowserClient()
          .storage.from(TEMPLATES_BUCKET)
          .uploadToSignedUrl(begun.value.path, begun.value.token, file);

        if (stored.error) {
          throw 'statusCode' in stored.error &&
            stored.error.statusCode === '413'
            ? new Error('This template is over 25 MB')
            : stored.error;
        }

        const parsed = await parseTemplateDocx({
          accountId,
          templateId: begun.value.templateId,
        });

        if (!parsed.ok) {
          throw new Error(parsed.refusal);
        }

        setDrafts(parsed.value);
        setTemplateId(begun.value.templateId);
      }),
    );
  }

  function updateDraft(index: number, patch: Partial<TemplateFieldDraft>) {
    setDrafts((current) =>
      current.map((draft, position) =>
        position === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function onSave() {
    if (!templateId) {
      return;
    }

    startSaving(
      reportingFailure(async () => {
        const saved = await saveTemplate({
          accountId,
          templateId,
          name,
          type,
          fields: drafts,
        });

        if (!saved.ok) {
          throw new Error(saved.refusal);
        }

        router.push(listHref);
      }),
    );
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Upload document</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'template-name'}>Name</Label>
            <Input
              id={'template-name'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={'e.g. Standard LOI'}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'template-type'}>Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as TemplateType)}
            >
              <SelectTrigger id={'template-type'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'template-file'}>Document (.docx)</Label>
            <Input
              id={'template-file'}
              type={'file'}
              accept={
                '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFile(file);
                }
              }}
            />
            {isParsing ? (
              <span className={'text-muted-foreground text-sm'}>
                Detecting fields
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {failure ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {failure}
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Fields ({drafts.length})</CardTitle>
          </CardHeader>
          <CardContent className={'flex flex-col gap-4'}>
            {drafts.map((draft, index) => (
              <div
                key={draft.key}
                className={
                  'grid gap-3 border-b pb-4 last:border-b-0 md:grid-cols-5'
                }
              >
                <div className={'flex flex-col gap-1'}>
                  <Label className={'text-xs'}>Key</Label>
                  <code className={'text-sm'}>{draft.key}</code>
                </div>
                <div className={'flex flex-col gap-1'}>
                  <Label className={'text-xs'}>Label</Label>
                  <Input
                    value={draft.label}
                    onChange={(event) =>
                      updateDraft(index, { label: event.target.value })
                    }
                  />
                </div>
                <div className={'flex flex-col gap-1'}>
                  <Label className={'text-xs'}>Type</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(value) =>
                      updateDraft(index, { type: value as FieldType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={'flex flex-col gap-1'}>
                  <Label className={'text-xs'}>Source</Label>
                  <Select
                    value={draft.source}
                    onValueChange={(value) =>
                      updateDraft(index, { source: value as FieldSource })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_SOURCES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={'flex flex-col gap-1'}>
                  <Label className={'text-xs'}>Source path</Label>
                  <Input
                    value={draft.source_path ?? ''}
                    disabled={draft.source === 'manual'}
                    onChange={(event) =>
                      updateDraft(index, {
                        source_path: event.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className={'flex gap-2'}>
        <Button
          type={'button'}
          onClick={onSave}
          disabled={
            isSaving ||
            !templateId ||
            name.trim().length === 0 ||
            drafts.length === 0
          }
        >
          {isSaving ? 'Saving' : 'Save template'}
        </Button>
      </div>
    </div>
  );
}

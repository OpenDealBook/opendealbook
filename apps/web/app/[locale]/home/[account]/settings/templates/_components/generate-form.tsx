'use client';

import { useMemo, useState, useTransition } from 'react';

import { generateFromTemplate } from '@odb/templates/server';
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
import {
  TemplateField,
  type TemplateFieldType,
} from '@odb/ui/template-field';

import { createGeneratedLinks } from '../actions';
import { SendToSellerPanel } from './send-to-seller-panel';

export interface TemplateFieldOption {
  key: string;
  label: string;
  type: string;
  source: string;
  required: boolean;
}

export interface TemplateOption {
  id: string;
  name: string;
  fields: TemplateFieldOption[];
}

export interface DealOption {
  id: string;
  label: string;
}

interface GenerateFormProps {
  accountId: string;
  templates: TemplateOption[];
  deals: DealOption[];
}

interface GeneratedResult {
  id: string;
  docxUrl: string | null;
  pdfUrl: string | null;
}

export function GenerateForm({
  accountId,
  templates,
  deals,
}: GenerateFormProps) {
  const [templateId, setTemplateId] = useState('');
  const [dealId, setDealId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  const template = useMemo(
    () => templates.find((entry) => entry.id === templateId) ?? null,
    [templates, templateId],
  );

  function onGenerate() {
    if (!template || !dealId) {
      return;
    }

    startGenerating(async () => {
      const manual: Record<string, string> = {};

      for (const field of template.fields) {
        if (field.source === 'manual' && values[field.key] !== undefined) {
          manual[field.key] = values[field.key]!;
        }
      }

      const generated = await generateFromTemplate({
        accountId,
        templateId: template.id,
        dealId,
        fieldValues: manual,
      });

      const links = await createGeneratedLinks({
        accountId,
        docxPath: generated.docx_path ?? '',
        pdfPath: generated.pdf_path ?? '',
      });

      setResult({
        id: generated.id,
        docxUrl: links.docxUrl,
        pdfUrl: links.pdfUrl,
      });
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Choose template and deal</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={'Select a template'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label>Deal</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger>
                <SelectValue placeholder={'Select a deal'} />
              </SelectTrigger>
              <SelectContent>
                {deals.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {template ? (
        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
          </CardHeader>
          <CardContent className={'flex flex-col gap-4'}>
            {template.fields.map((field) =>
              field.source === 'manual' ? (
                <TemplateField
                  key={field.key}
                  label={field.label}
                  type={field.type as TemplateFieldType}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.key]: value }))
                  }
                />
              ) : (
                <div key={field.key} className={'flex flex-col gap-1.5'}>
                  <Label>{field.label}</Label>
                  <Input value={''} disabled />
                  <span className={'text-muted-foreground text-xs'}>
                    Auto-filled from {field.source}
                  </span>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Button
          type={'button'}
          onClick={onGenerate}
          disabled={isGenerating || !template || !dealId}
        >
          {isGenerating ? 'Generating' : 'Generate'}
        </Button>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Generated document</CardTitle>
          </CardHeader>
          <CardContent className={'flex flex-col gap-4'}>
            <div className={'flex gap-4 text-sm'}>
              {result.docxUrl ? (
                <a
                  href={result.docxUrl}
                  className={'font-medium underline'}
                  target={'_blank'}
                  rel={'noreferrer'}
                >
                  Download DOCX
                </a>
              ) : null}
              {result.pdfUrl ? (
                <a
                  href={result.pdfUrl}
                  className={'font-medium underline'}
                  target={'_blank'}
                  rel={'noreferrer'}
                >
                  Download PDF
                </a>
              ) : null}
            </div>

            <SendToSellerPanel
              key={result.id}
              generatedDocumentId={result.id}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';

import type { SharePermission } from '@tuckin/templates';
import {
  generateFromTemplate,
  sendToSellerAction,
} from '@tuckin/templates/server';
import { Button } from '@tuckin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuckin/ui/card';
import { Input } from '@tuckin/ui/input';
import { Label } from '@tuckin/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuckin/ui/select';
import {
  TemplateField,
  type TemplateFieldType,
} from '@tuckin/ui/template-field';

import { createGeneratedLinks } from '../actions';

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

const PERMISSIONS: SharePermission[] = ['view', 'comment', 'edit'];

export function GenerateForm({
  accountId,
  templates,
  deals,
}: GenerateFormProps) {
  const [templateId, setTemplateId] = useState('');
  const [dealId, setDealId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [recipient, setRecipient] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [sent, setSent] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const [isSending, startSending] = useTransition();

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
      setSent(false);
    });
  }

  function onSend() {
    if (!result || recipient.trim().length === 0) {
      return;
    }

    startSending(async () => {
      await sendToSellerAction({
        generatedDocumentId: result.id,
        recipientUserId: recipient,
        permission,
        expiresAt: null,
      });
      setSent(true);
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

            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'seller-recipient'}>
                Seller recipient (user id)
              </Label>
              <Input
                id={'seller-recipient'}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label>Permission</Label>
              <Select
                value={permission}
                onValueChange={(value) =>
                  setPermission(value as SharePermission)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={'flex items-center gap-3'}>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={onSend}
                disabled={isSending || recipient.trim().length === 0}
              >
                {isSending ? 'Sending' : 'Send to seller'}
              </Button>
              {sent ? (
                <span className={'text-muted-foreground text-sm'}>
                  Sent to seller
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

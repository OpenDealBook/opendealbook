import type { TablesInsert } from '@tuckin/supabase';

import type { DocxTemplateEngine } from '../superdoc';
import type { FieldSource, FieldType, TemplateFieldDraft } from '../types';

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

const SOURCE_PREFIXES: Record<string, FieldSource> = {
  deal: 'deal',
  firm: 'firm',
  account: 'account',
};

export function extractPlaceholderKeys(text: string): string[] {
  const keys = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER)) {
    keys.add(match[1]!);
  }

  return [...keys];
}

export function draftFromKey(
  key: string,
  sortOrder: number,
): TemplateFieldDraft {
  const segments = key.split('.');
  const head = segments[0]!;
  const path = segments.slice(1);
  const source = SOURCE_PREFIXES[head] ?? 'manual';
  const sourcePath =
    source === 'manual' ? null : path.length > 0 ? path.join('.') : head;
  const labelFrom = source === 'manual' ? head : (path.at(-1) ?? head);

  return {
    key,
    label: humanize(labelFrom),
    type: 'text',
    source,
    source_path: sourcePath,
    format: null,
    required: false,
    sort_order: sortOrder,
  };
}

export function keysToDrafts(keys: string[]): TemplateFieldDraft[] {
  return keys.map((key, index) => draftFromKey(key, index));
}

export async function parseTemplateFields(
  docx: Uint8Array,
  engine: DocxTemplateEngine,
): Promise<TemplateFieldDraft[]> {
  const keys = await engine.scanPlaceholders(docx);

  return keysToDrafts(keys);
}

export interface SelectionFieldInput {
  key: string;
  sortOrder: number;
  label?: string;
  type?: FieldType;
  source?: FieldSource;
  sourcePath?: string | null;
  format?: string | null;
  required?: boolean;
}

export interface SelectionField {
  draft: TemplateFieldDraft;
  placeholder: string;
}

export function fieldFromSelection(input: SelectionFieldInput): SelectionField {
  return {
    draft: {
      key: input.key,
      label: input.label ?? humanize(input.key),
      type: input.type ?? 'text',
      source: input.source ?? 'manual',
      source_path: input.sourcePath ?? null,
      format: input.format ?? null,
      required: input.required ?? false,
      sort_order: input.sortOrder,
    },
    placeholder: `{{${input.key}}}`,
  };
}

export function draftsToRows(
  templateId: string,
  drafts: TemplateFieldDraft[],
): TablesInsert<'template_field'>[] {
  return drafts.map((draft) => ({
    template_id: templateId,
    key: draft.key,
    label: draft.label,
    type: draft.type,
    source: draft.source,
    source_path: draft.source_path,
    format: draft.format,
    required: draft.required,
    sort_order: draft.sort_order,
  }));
}

function humanize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

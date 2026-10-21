import type { Tables } from '@odb/supabase';

import { formatOwnerNames } from './owner-names';

export interface DealContext {
  deal: Tables<'deal'>;
  firm: Tables<'firm'> | null;
  account: Record<string, unknown>;
}

export interface ResolvedFields {
  values: Record<string, string>;
  valuesJson: Record<string, unknown>;
}

export function resolveFieldValues(
  fields: Tables<'template_field'>[],
  context: DealContext,
  manual: Record<string, unknown>,
): ResolvedFields {
  const values: Record<string, string> = {};
  const valuesJson: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = resolveRaw(field, context, manual);
    valuesJson[field.key] = raw;
    values[field.key] = formatFieldValue(raw, field.type, field.format);
  }

  return { values, valuesJson };
}

export class MissingFieldsError extends Error {
  constructor(labels: string[]) {
    super(`Fill in: ${labels.join(', ')}`);
  }
}

export function assertNoBlankFields(
  fields: Tables<'template_field'>[],
  values: Record<string, string>,
): void {
  const blank = fields.filter((field) => values[field.key]!.trim() === '');

  if (blank.length > 0) {
    throw new MissingFieldsError(
      blank.map((field) => field.label ?? field.key),
    );
  }
}

export function formatFieldValue(
  value: unknown,
  type: string | null,
  format: string | null,
): string {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'currency': {
      const amount = Number(value);
      const fractionDigits = Number.isInteger(amount) ? 0 : 2;

      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: format ?? 'USD',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
    }
    case 'percent':
      return `${Number(value)}%`;
    case 'date': {
      const date = new Date(value as string | number | Date);

      return format === 'long'
        ? date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })
        : date.toISOString().slice(0, 10);
    }
    case 'list':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return String(value);
  }
}

function resolveRaw(
  field: Tables<'template_field'>,
  context: DealContext,
  manual: Record<string, unknown>,
): unknown {
  if (field.source === 'manual' || !field.source_path) {
    return manual[field.key];
  }

  const root =
    field.source === 'deal'
      ? context.deal
      : field.source === 'firm'
        ? firmMergeRoot(context.firm)
        : field.source === 'account'
          ? context.account
          : manual;

  return readPath(root, field.source_path);
}

function firmMergeRoot(firm: Tables<'firm'> | null) {
  return firm && { ...firm, owner_name: formatOwnerNames(firm.owner_names) };
}

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[key];
    }

    return undefined;
  }, root);
}

import type { Tables } from '@odb/supabase';

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

export function formatFieldValue(
  value: unknown,
  type: string | null,
  format: string | null,
): string {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: format ?? 'USD',
      }).format(Number(value));
    case 'percent':
      return `${Number(value)}%`;
    case 'date':
      return new Date(value as string | number | Date)
        .toISOString()
        .slice(0, 10);
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
        ? (context.firm ?? {})
        : field.source === 'account'
          ? context.account
          : manual;

  return readPath(root, field.source_path);
}

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[key];
    }

    return undefined;
  }, root);
}

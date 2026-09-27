import { z } from 'zod';

export const templateTypeSchema = z.enum([
  'nda',
  'loi',
  'apa',
  'data_request',
  'letter',
]);

export const fieldTypeSchema = z.enum([
  'text',
  'currency',
  'date',
  'percent',
  'list',
]);

export const fieldSourceSchema = z.enum(['deal', 'firm', 'account', 'manual']);

export const sharePermissionSchema = z.enum(['view', 'comment', 'edit']);

export type TemplateType = z.infer<typeof templateTypeSchema>;
export type FieldType = z.infer<typeof fieldTypeSchema>;
export type FieldSource = z.infer<typeof fieldSourceSchema>;
export type SharePermission = z.infer<typeof sharePermissionSchema>;

export interface TemplateFieldDraft {
  key: string;
  label: string;
  type: FieldType;
  source: FieldSource;
  source_path: string | null;
  format: string | null;
  required: boolean;
  sort_order: number;
}

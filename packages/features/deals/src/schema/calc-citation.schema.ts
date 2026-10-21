import { z } from 'zod';

const citationLocatorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('page'),
    page: z.number().int().min(1, 'Page numbers start at 1'),
  }),
  z.object({ kind: z.literal('sheet'), sheet: z.string() }),
  z.object({ kind: z.literal('document') }),
]);

export type CitationLocator = z.infer<typeof citationLocatorSchema>;

export const addCalcInputCitationSchema = z.object({
  calc_version_id: z.uuid(),
  row_id: z.uuid().optional(),
  input_key: z.string(),
  dr_document_id: z.uuid(),
  locator: citationLocatorSchema,
  cell: z.string().optional(),
});

export const removeCalcInputCitationSchema = z.object({
  calc_version_id: z.uuid(),
  citation_id: z.uuid(),
});

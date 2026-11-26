import { z } from 'zod';

import { getLogger } from '@odb/shared/logger';

import type { DocumentCitation } from './citations';

const storedCited = z.object({
  documentId: z.string(),
  documentName: z.string(),
  version: z.number(),
  excerpt: z.string().optional(),
  fromOcr: z.boolean(),
});

const storedCitation: z.ZodType<DocumentCitation> = z.union([
  storedCited.extend({ pageFrom: z.number(), pageTo: z.number() }),
  storedCited.extend({ sheet: z.string(), cellRange: z.string() }),
]);

export function parseStoredCitations(
  stored: unknown,
  questionId: string,
): DocumentCitation[] {
  return z
    .array(z.unknown())
    .parse(stored)
    .flatMap((entry) => {
      const parsed = storedCitation.safeParse(entry);
      if (!parsed.success) {
        getLogger().warn(
          { questionId, err: parsed.error },
          'Dropped a stored AI citation that does not parse',
        );
        return [];
      }
      return [parsed.data];
    });
}

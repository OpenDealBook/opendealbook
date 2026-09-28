import { z } from 'zod';

import type { UploadBody } from '../storage';

export const stageUploadSchema = z.object({
  dealId: z.uuid(),
  kind: z.enum(['single', 'group', 'zip']),
  sourceFilename: z.string().nullish(),
  files: z
    .array(
      z.object({
        originalPath: z.string().min(1),
        contentType: z.string().nullish(),
        body: z.custom<UploadBody>((value) => value != null),
      }),
    )
    .min(1),
});

export const expandBatchSchema = z.object({
  dealId: z.uuid(),
  batchId: z.uuid(),
  targetFolderId: z.uuid(),
});

export type StageUploadInput = z.infer<typeof stageUploadSchema>;
export type ExpandBatchInput = z.infer<typeof expandBatchSchema>;

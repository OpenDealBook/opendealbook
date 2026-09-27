import { z } from 'zod';

import type { UploadBody } from '../storage';

export const uploadDocumentSchema = z.object({
  dealId: z.uuid(),
  folderId: z.uuid(),
  name: z.string().min(1),
  body: z.custom<UploadBody>((value) => value != null),
  checklistItemId: z.uuid().nullish(),
});

export const moveDocumentSchema = z.object({
  dealId: z.uuid(),
  documentId: z.uuid(),
  folderId: z.uuid(),
});

export const bulkDownloadSchema = z.object({
  dealId: z.uuid(),
  documentIds: z.array(z.uuid()),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type MoveDocumentInput = z.infer<typeof moveDocumentSchema>;
export type BulkDownloadInput = z.infer<typeof bulkDownloadSchema>;

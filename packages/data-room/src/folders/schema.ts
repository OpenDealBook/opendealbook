import { z } from 'zod';

export const createFolderSchema = z.object({
  dealId: z.uuid(),
  parentId: z.uuid().nullish(),
  name: z.string().min(1),
});

export const renameFolderSchema = z.object({
  dealId: z.uuid(),
  folderId: z.uuid(),
  name: z.string().min(1),
});

export const moveFolderSchema = z.object({
  dealId: z.uuid(),
  folderId: z.uuid(),
  parentId: z.uuid().nullish(),
});

export const reorderFoldersSchema = z.object({
  dealId: z.uuid(),
  parentId: z.uuid().nullish(),
  orderedIds: z.array(z.uuid()),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
export type ReorderFoldersInput = z.infer<typeof reorderFoldersSchema>;

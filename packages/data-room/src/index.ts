export { buildFolderTree } from './folders/tree';
export type { FolderNode, FolderRow } from './folders/tree';
export {
  createFolderSchema,
  renameFolderSchema,
  moveFolderSchema,
  reorderFoldersSchema,
} from './folders/schema';
export type {
  CreateFolderInput,
  RenameFolderInput,
  MoveFolderInput,
  ReorderFoldersInput,
} from './folders/schema';

export { nextVersion } from './documents/version';
export {
  documentType,
  groupDocumentsByFolder,
} from './documents/grouped';
export type {
  BrowseDocument,
  DocumentRow,
  FolderGroup,
} from './documents/grouped';
export {
  uploadDocumentSchema,
  moveDocumentSchema,
  bulkDownloadSchema,
  documentSignedUrlSchema,
} from './documents/schema';
export type {
  UploadDocumentInput,
  MoveDocumentInput,
  BulkDownloadInput,
  DocumentSignedUrlInput,
} from './documents/schema';

export {
  dataRoomKeys,
  fetchFolders,
  fetchDocuments,
  listByFolder,
} from './shared';

export { stageUploadSchema, expandBatchSchema } from './uploads/schema';
export type {
  StageUploadInput,
  ExpandBatchInput,
} from './uploads/schema';
export type { StagedBatch } from './uploads/stage';
export type { ExpandResult } from './uploads/expand';

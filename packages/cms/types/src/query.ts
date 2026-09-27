import type { CmsCollection, ContentStatus } from './cms';

export interface GetContentItemsParams {
  collection: CmsCollection;
  limit?: number;
  offset?: number;
  language?: string;
  sortBy?: 'publishedAt' | 'order' | 'title';
  sortDirection?: 'asc' | 'desc';
  status?: ContentStatus;
}

export interface ContentItemsResult<T> {
  items: T[];
  total: number;
}

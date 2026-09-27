import type {
  CmsCollection,
  ContentItem,
  ContentItemsResult,
  GetContentItemsParams,
} from '@tuckin/cms-types';

export interface Cms {
  getContentItems(
    params: GetContentItemsParams,
  ): Promise<ContentItemsResult<ContentItem>>;

  getContentItemBySlug(params: {
    slug: string;
    collection: CmsCollection;
  }): Promise<ContentItem | undefined>;

  getCategories(): Promise<string[]>;

  getTags(): Promise<string[]>;
}

import type { Cms } from '@odb/cms';
import type {
  CmsCollection,
  ContentItem,
  ContentItemsResult,
  ContentStatus,
  GetContentItemsParams,
} from '@odb/cms-types';

import { keystaticConfig } from './keystatic.config';

interface ReaderEntry {
  title: string;
  description?: string | null;
  publishedAt: string;
  status: ContentStatus;
  categories?: readonly string[];
  tags?: readonly string[];
  image?: string | null;
  order?: number | null;
  parent?: string | null;
  content: () => Promise<unknown>;
}

interface ReaderItem {
  slug: string;
  entry: ReaderEntry;
}

interface CollectionReader {
  all: () => Promise<ReaderItem[]>;
  read: (slug: string) => Promise<ReaderEntry | null>;
}

export interface CmsReader {
  collections: Record<CmsCollection, CollectionReader>;
}

async function mapEntry(
  slug: string,
  entry: ReaderEntry,
): Promise<ContentItem> {
  return {
    id: slug,
    slug,
    title: entry.title,
    content: await entry.content(),
    description: entry.description ?? undefined,
    publishedAt: entry.publishedAt,
    status: entry.status,
    categories: entry.categories ? [...entry.categories] : undefined,
    tags: entry.tags ? [...entry.tags] : undefined,
    image: entry.image ?? undefined,
    order: entry.order ?? undefined,
    parentId: entry.parent ?? undefined,
  };
}

function compareEntries(
  a: ReaderEntry,
  b: ReaderEntry,
  sortBy: NonNullable<GetContentItemsParams['sortBy']>,
): number {
  if (sortBy === 'title') {
    return a.title.localeCompare(b.title);
  }

  if (sortBy === 'order') {
    return (a.order ?? 0) - (b.order ?? 0);
  }

  return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
}

export function createCmsFromReader(reader: CmsReader): Cms {
  return {
    async getContentItems(
      params: GetContentItemsParams,
    ): Promise<ContentItemsResult<ContentItem>> {
      const status = params.status ?? 'published';
      const sortBy = params.sortBy ?? 'publishedAt';
      const sign = (params.sortDirection ?? 'asc') === 'asc' ? 1 : -1;

      const entries = await reader.collections[params.collection].all();
      const filtered = entries.filter((item) => item.entry.status === status);

      const sorted = [...filtered].sort(
        (a, b) => sign * compareEntries(a.entry, b.entry, sortBy),
      );

      const offset = params.offset ?? 0;
      const limit = params.limit ?? sorted.length;
      const page = sorted.slice(offset, offset + limit);

      const items = await Promise.all(
        page.map((item) => mapEntry(item.slug, item.entry)),
      );

      return { items, total: filtered.length };
    },

    async getContentItemBySlug({
      slug,
      collection,
    }: {
      slug: string;
      collection: CmsCollection;
    }): Promise<ContentItem | undefined> {
      const entry = await reader.collections[collection].read(slug);

      if (!entry) {
        return undefined;
      }

      return mapEntry(slug, entry);
    },

    async getCategories(): Promise<string[]> {
      const entries = await reader.collections.posts.all();
      const values = new Set<string>();

      for (const item of entries) {
        for (const category of item.entry.categories ?? []) {
          values.add(category);
        }
      }

      return [...values];
    },

    async getTags(): Promise<string[]> {
      const entries = await reader.collections.posts.all();
      const values = new Set<string>();

      for (const item of entries) {
        for (const tag of item.entry.tags ?? []) {
          values.add(tag);
        }
      }

      return [...values];
    },
  };
}

export async function createCmsClient(): Promise<Cms> {
  const { createReader } = await import('@keystatic/core/reader');
  const root = process.env.KEYSTATIC_CONTENT_ROOT ?? process.cwd();
  const reader = createReader(root, keystaticConfig) as unknown as CmsReader;

  return createCmsFromReader(reader);
}

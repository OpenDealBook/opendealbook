import { describe, expect, it } from 'vitest';

import { createCmsFromReader, type CmsReader } from './create-cms-client';

interface FakeEntry {
  title: string;
  description?: string | null;
  publishedAt: string;
  status: 'draft' | 'published' | 'review';
  categories?: string[];
  tags?: string[];
  image?: string | null;
  order?: number | null;
  parent?: string | null;
  body: unknown;
}

function reader(posts: Array<{ slug: string; entry: FakeEntry }>): CmsReader {
  const bySlug = new Map(posts.map((item) => [item.slug, item.entry]));

  const toReaderItem = (item: { slug: string; entry: FakeEntry }) => ({
    slug: item.slug,
    entry: { ...item.entry, content: async () => item.entry.body },
  });

  const collection = {
    all: async () => posts.map(toReaderItem),
    read: async (slug: string) => {
      const entry = bySlug.get(slug);
      return entry ? { ...entry, content: async () => entry.body } : null;
    },
  };

  return {
    collections: { posts: collection, documentation: collection },
  } as unknown as CmsReader;
}

const draft: FakeEntry = {
  title: 'Draft One',
  publishedAt: '2024-01-01',
  status: 'draft',
  body: 'draft-body',
};

const published: FakeEntry = {
  title: 'Published One',
  description: 'A published post',
  publishedAt: '2024-02-01',
  status: 'published',
  categories: ['news'],
  tags: ['launch'],
  image: '/img.png',
  order: 2,
  parent: 'root',
  body: 'published-body',
};

describe('getContentItems', () => {
  it('returns only published items by default and maps the entry to a ContentItem', async () => {
    const cms = createCmsFromReader(
      reader([
        { slug: 'draft-one', entry: draft },
        { slug: 'published-one', entry: published },
      ]),
    );

    const result = await cms.getContentItems({ collection: 'posts' });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      {
        id: 'published-one',
        slug: 'published-one',
        title: 'Published One',
        content: 'published-body',
        description: 'A published post',
        publishedAt: '2024-02-01',
        status: 'published',
        categories: ['news'],
        tags: ['launch'],
        image: '/img.png',
        order: 2,
        parentId: 'root',
      },
    ]);
  });

  it('honors sortBy order with descending direction', async () => {
    const cms = createCmsFromReader(
      reader([
        {
          slug: 'a',
          entry: {
            title: 'A',
            publishedAt: '2024-01-01',
            status: 'published',
            order: 1,
            body: '',
          },
        },
        {
          slug: 'b',
          entry: {
            title: 'B',
            publishedAt: '2024-01-01',
            status: 'published',
            order: 3,
            body: '',
          },
        },
        {
          slug: 'c',
          entry: {
            title: 'C',
            publishedAt: '2024-01-01',
            status: 'published',
            order: 2,
            body: '',
          },
        },
      ]),
    );

    const result = await cms.getContentItems({
      collection: 'posts',
      sortBy: 'order',
      sortDirection: 'desc',
    });

    expect(result.items.map((item) => item.slug)).toEqual(['b', 'c', 'a']);
  });
});

describe('getContentItemBySlug', () => {
  it('returns undefined for a missing slug', async () => {
    const cms = createCmsFromReader(
      reader([{ slug: 'published-one', entry: published }]),
    );

    const result = await cms.getContentItemBySlug({
      slug: 'does-not-exist',
      collection: 'posts',
    });

    expect(result).toBeUndefined();
  });
});

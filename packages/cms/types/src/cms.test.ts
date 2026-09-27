import { describe, expect, it } from 'vitest';

import { cmsCollectionSchema, contentStatusSchema } from './cms';

describe('cmsCollectionSchema', () => {
  it('accepts the supported collections', () => {
    expect(cmsCollectionSchema.options).toEqual(['posts', 'documentation']);
  });

  it('rejects an unsupported collection', () => {
    expect(cmsCollectionSchema.safeParse('pages').success).toBe(false);
  });
});

describe('contentStatusSchema', () => {
  it('accepts the supported statuses', () => {
    expect(contentStatusSchema.options).toEqual([
      'draft',
      'published',
      'review',
    ]);
  });

  it('rejects an unsupported status', () => {
    expect(contentStatusSchema.safeParse('archived').success).toBe(false);
  });
});

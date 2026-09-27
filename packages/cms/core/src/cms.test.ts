import { describe, expect, it } from 'vitest';

import type { Cms } from './cms';

describe('Cms', () => {
  it('is satisfied by an implementation exposing the four query methods', () => {
    const client: Cms = {
      getContentItems: async () => ({ items: [], total: 0 }),
      getContentItemBySlug: async () => undefined,
      getCategories: async () => [],
      getTags: async () => [],
    };

    expect(typeof client.getContentItems).toBe('function');
    expect(typeof client.getContentItemBySlug).toBe('function');
    expect(typeof client.getCategories).toBe('function');
    expect(typeof client.getTags).toBe('function');
  });
});

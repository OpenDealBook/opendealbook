import { describe, expect, it, vi } from 'vitest';

import { createMessageLoader } from './messages';

describe('createMessageLoader', () => {
  it('merges each namespace under its own key for the requested locale', async () => {
    const importer = vi.fn(async (_locale: string, namespace: string) => ({
      default: { title: `${namespace}-title` },
    }));

    const loadMessages = createMessageLoader(['common', 'auth'], importer);
    const messages = await loadMessages('en');

    expect(messages).toEqual({
      common: { title: 'common-title' },
      auth: { title: 'auth-title' },
    });
    expect(importer).toHaveBeenCalledWith('en', 'common');
    expect(importer).toHaveBeenCalledWith('en', 'auth');
  });
});

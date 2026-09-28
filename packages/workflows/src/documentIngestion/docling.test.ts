import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractMarkdown } from './docling';

const config = { baseUrl: 'http://docling.test', apiKey: 'x-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubSequence(bodies: unknown[]): void {
  const queue = [...bodies];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => queue.shift() })),
  );
}

describe('extractMarkdown', () => {
  it('enqueues an async convert, polls to success and returns the markdown result', async () => {
    stubSequence([
      { task_id: 't1' },
      { task_status: 'pending' },
      { task_status: 'success' },
      { document: { md_content: '# Extracted' } },
    ]);

    await expect(extractMarkdown(config, 'http://signed')).resolves.toBe(
      '# Extracted',
    );
  });

  it('throws when the conversion task reports failure', async () => {
    stubSequence([{ task_id: 't1' }, { task_status: 'failure' }]);

    await expect(extractMarkdown(config, 'http://signed')).rejects.toThrow(
      /t1/,
    );
  });
});

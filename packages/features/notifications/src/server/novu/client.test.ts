import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createNovuClient } from './client';

const silentNovu = createServer(() => {});

beforeEach(async () => {
  await new Promise<void>((resolve) =>
    silentNovu.listen(0, '127.0.0.1', resolve),
  );
  const { port } = silentNovu.address() as AddressInfo;
  vi.stubEnv('NOVU_API_KEY', 'test-key');
  vi.stubEnv('NOVU_API_URL', `http://127.0.0.1:${port}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  silentNovu.closeAllConnections();
  await new Promise((resolve) => silentNovu.close(resolve));
});

it('gives up on a Novu backend that never answers after 15 seconds', async () => {
  const startedAt = Date.now();

  await expect(
    createNovuClient().trigger('deal.offer_submitted', {
      to: { subscriberId: 'user-1' },
      payload: {},
    }),
  ).rejects.toThrow('timeout of 15000ms exceeded');

  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(14_900);
}, 20_000);

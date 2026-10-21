import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));

import DataRoomUploadPage from './page';

const dealId = '11111111-1111-4111-8111-111111111111';

function open(deal?: string) {
  return DataRoomUploadPage({
    params: Promise.resolve({ locale: 'en', account: 'harbor-holdings' }),
    searchParams: Promise.resolve(deal ? { deal } : {}),
  });
}

describe('the old data-room upload address', () => {
  it('sends a visitor with a deal to that deal, where each folder has Upload', async () => {
    await expect(open(dealId)).rejects.toThrow(
      `redirect /home/harbor-holdings/deals/${dealId}`,
    );
  });

  it('sends a visitor without a deal to the deals list', async () => {
    await expect(open()).rejects.toThrow(
      'redirect /home/harbor-holdings/deals',
    );
  });
});

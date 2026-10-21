import { expect, it } from 'vitest';

import { uploadBuyerProfilePhoto } from './storage';

it('stores a photo whose name storage keys cannot hold', async () => {
  const uploads: string[] = [];
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { data: { path }, error: null };
        },
      }),
    },
  } as unknown as Parameters<typeof uploadBuyerProfilePhoto>[0];

  await uploadBuyerProfilePhoto(
    client,
    'acc-1',
    new File(['x'], '[Me] & family.png', { type: 'image/png' }),
  );

  expect(uploads[0]).toMatch(/^acc-1\/[0-9a-f-]+-[A-Za-z0-9._-]+$/);
});

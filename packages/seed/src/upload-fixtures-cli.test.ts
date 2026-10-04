import { expect, test, vi } from 'vitest';

vi.mock('./upload-template-fixtures', () => ({
  uploadTemplateFixtures: vi.fn().mockResolvedValue(undefined),
}));

test('importing the runner does not upload; main triggers the upload', async () => {
  const { uploadTemplateFixtures } = await import('./upload-template-fixtures');
  const { main } = await import('./upload-fixtures-cli');

  expect(uploadTemplateFixtures).not.toHaveBeenCalled();

  await main();

  expect(uploadTemplateFixtures).toHaveBeenCalledOnce();
});

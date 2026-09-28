import { afterEach, describe, expect, it } from 'vitest';

import { createCmsClient } from './create-cms-client';

const originalClient = process.env.CMS_CLIENT;

afterEach(() => {
  if (originalClient === undefined) {
    delete process.env.CMS_CLIENT;
  } else {
    process.env.CMS_CLIENT = originalClient;
  }
});

describe('createCmsClient', () => {
  it('rejects a provider name that is not registered', async () => {
    process.env.CMS_CLIENT = 'nope';

    await expect(createCmsClient()).rejects.toThrow(
      'Unknown CMS provider: nope',
    );
  });

  it('defaults to the keystatic provider when no provider is configured', async () => {
    delete process.env.CMS_CLIENT;

    await expect(createCmsClient()).rejects.toThrow('@odb/keystatic');
  });

  it('selects the provider named by the CMS_CLIENT environment variable', async () => {
    process.env.CMS_CLIENT = 'wordpress';

    await expect(createCmsClient()).rejects.toThrow('@odb/wordpress');
  });
});

import type { Cms } from './cms';

const DEFAULT_PROVIDER = 'keystatic';

const providerSpecifiers: Record<string, string> = {
  keystatic: '@tuckin/keystatic',
  wordpress: '@tuckin/wordpress',
};

type ProviderModule = {
  createCmsClient: () => Cms | Promise<Cms>;
};

export async function createCmsClient(): Promise<Cms> {
  const provider = process.env.CMS_CLIENT ?? DEFAULT_PROVIDER;
  const specifier = providerSpecifiers[provider];

  if (!specifier) {
    throw new Error(`Unknown CMS provider: ${provider}`);
  }

  const providerModule = await loadProviderModule(specifier, provider);

  return providerModule.createCmsClient();
}

async function loadProviderModule(
  specifier: string,
  provider: string,
): Promise<ProviderModule> {
  try {
    return (await import(specifier)) as ProviderModule;
  } catch {
    throw new Error(
      `CMS provider "${provider}" is not installed: could not load ${specifier}`,
    );
  }
}

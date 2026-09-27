import type { AbstractIntlMessages } from 'next-intl';

import type { Locale } from './config';

export type NamespaceImporter = (
  locale: Locale,
  namespace: string,
) => Promise<{ default: AbstractIntlMessages }>;

export type MessagesLoader = (
  locale: Locale,
) => Promise<Record<string, AbstractIntlMessages>>;

export function createMessageLoader(
  namespaces: readonly string[],
  importer: NamespaceImporter,
): MessagesLoader {
  return async (locale) => {
    const entries = await Promise.all(
      namespaces.map(async (namespace) => {
        const loaded = await importer(locale, namespace);

        return [namespace, loaded.default] as const;
      }),
    );

    return Object.fromEntries(entries);
  };
}

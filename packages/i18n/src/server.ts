import { getMessages, getTranslations } from 'next-intl/server';

import { resolveLocale } from './config';

export async function createI18nServerInstance(locale?: string) {
  const resolvedLocale = resolveLocale(locale);

  const [messages, t] = await Promise.all([
    getMessages({ locale: resolvedLocale }),
    getTranslations({ locale: resolvedLocale }),
  ]);

  return { locale: resolvedLocale, messages, t };
}

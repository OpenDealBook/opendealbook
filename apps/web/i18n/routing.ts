import { defineRouting } from 'next-intl/routing';

import { i18nConfig } from '@odb/i18n/config';

export const routing = defineRouting({
  locales: i18nConfig.locales,
  defaultLocale: i18nConfig.defaultLocale,
  localeCookie: { name: i18nConfig.localeCookieName },
});

import { getRequestConfig } from 'next-intl/server';

import { getLogger } from '@tuckin/shared/logger';

import { i18nConfig, resolveLocale } from './config';
import type { MessagesLoader } from './messages';

export function createI18nRequestConfig(loadMessages: MessagesLoader) {
  return getRequestConfig(async ({ requestLocale }) => {
    const locale = resolveLocale(await requestLocale);
    const messages = await loadMessages(locale);

    return {
      locale,
      messages,
      timeZone: i18nConfig.timeZone,
      getMessageFallback: ({ key }) => key,
      onError: (error) => {
        getLogger().error(
          { subsystem: 'next-intl', locale, err: error },
          error.message,
        );
      },
    };
  });
}

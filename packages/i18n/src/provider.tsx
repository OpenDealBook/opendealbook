'use client';

import type { ReactNode } from 'react';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';

import { i18nConfig } from './config';

interface I18nProviderProps {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone?: string;
  children: ReactNode;
}

export function I18nProvider({
  locale,
  messages,
  timeZone = i18nConfig.timeZone,
  children,
}: I18nProviderProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
      getMessageFallback={({ key }) => key}
    >
      {children}
    </NextIntlClientProvider>
  );
}

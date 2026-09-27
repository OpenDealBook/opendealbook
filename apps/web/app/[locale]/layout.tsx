import type { ReactNode } from 'react';

import { notFound } from 'next/navigation';

import { hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

import { I18nProvider } from '@tuckin/i18n/provider';

import { routing } from '~/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <I18nProvider locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  );
}

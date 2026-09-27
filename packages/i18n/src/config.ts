import { z } from 'zod';

const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en';

const configuredLocales =
  process.env.NEXT_PUBLIC_LOCALES?.split(',').map((value) => value.trim()) ??
  [];

const locales = configuredLocales.includes(defaultLocale)
  ? configuredLocales
  : [defaultLocale, ...configuredLocales];

export type Locale = string;

export interface I18nConfig {
  defaultLocale: Locale;
  locales: Locale[];
  timeZone: string;
  localeCookieName: string;
}

export const i18nConfig: I18nConfig = {
  defaultLocale,
  locales,
  timeZone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? 'UTC',
  localeCookieName: 'lang',
};

const supportedLocale = z.enum(i18nConfig.locales as [Locale, ...Locale[]]);

export function resolveLocale(candidate: string | null | undefined): Locale {
  const result = supportedLocale.safeParse(candidate);

  return result.success ? result.data : i18nConfig.defaultLocale;
}

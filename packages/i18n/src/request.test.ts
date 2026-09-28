import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getRequestConfig: (
    handler: (params: {
      requestLocale: Promise<string | undefined>;
    }) => unknown,
  ) => handler,
}));

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

import { i18nConfig } from './config';
import { createI18nRequestConfig } from './request';

describe('createI18nRequestConfig', () => {
  it('resolves the request locale and loads its messages', async () => {
    const loadMessages = vi.fn(async () => ({ common: { hi: 'hi' } }));
    const handler = createI18nRequestConfig(loadMessages) as (params: {
      requestLocale: Promise<string | undefined>;
    }) => Promise<{ locale: string; messages: unknown; timeZone: string }>;

    const config = await handler({
      requestLocale: Promise.resolve(i18nConfig.defaultLocale),
    });

    expect(config.locale).toBe(i18nConfig.defaultLocale);
    expect(config.messages).toEqual({ common: { hi: 'hi' } });
    expect(config.timeZone).toBe(i18nConfig.timeZone);
    expect(loadMessages).toHaveBeenCalledWith(i18nConfig.defaultLocale);
  });

  it('falls back to the default locale for an unsupported request locale', async () => {
    const loadMessages = vi.fn(async () => ({}));
    const handler = createI18nRequestConfig(loadMessages) as (params: {
      requestLocale: Promise<string | undefined>;
    }) => Promise<{ locale: string }>;

    const config = await handler({ requestLocale: Promise.resolve('xx') });

    expect(config.locale).toBe(i18nConfig.defaultLocale);
  });
});

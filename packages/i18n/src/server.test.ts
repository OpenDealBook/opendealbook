import { describe, expect, it, vi } from 'vitest';

const getMessages = vi.fn(async (_opts: unknown) => ({ common: { hi: 'hi' } }));
const getTranslations = vi.fn(async (_opts: unknown) => (key: string) => key);

vi.mock('next-intl/server', () => ({
  getMessages: (opts: unknown) => getMessages(opts),
  getTranslations: (opts: unknown) => getTranslations(opts),
}));

import { i18nConfig } from './config';
import { createI18nServerInstance } from './server';

describe('createI18nServerInstance', () => {
  it('resolves messages and a translator for the resolved locale', async () => {
    const instance = await createI18nServerInstance('xx');

    expect(instance.locale).toBe(i18nConfig.defaultLocale);
    expect(instance.messages).toEqual({ common: { hi: 'hi' } });
    expect(getMessages).toHaveBeenCalledWith({
      locale: i18nConfig.defaultLocale,
    });
    expect(instance.t('missing.key')).toBe('missing.key');
  });
});

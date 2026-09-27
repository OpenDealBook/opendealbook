import { describe, expect, it } from 'vitest';

import { i18nConfig, resolveLocale } from './config';

describe('resolveLocale', () => {
  it('returns the candidate when it is a supported locale', () => {
    expect(resolveLocale(i18nConfig.defaultLocale)).toBe(
      i18nConfig.defaultLocale,
    );
  });

  it('falls back to the default locale when the candidate is unsupported', () => {
    expect(resolveLocale('xx')).toBe(i18nConfig.defaultLocale);
  });

  it('falls back to the default locale when the candidate is null', () => {
    expect(resolveLocale(null)).toBe(i18nConfig.defaultLocale);
  });
});

describe('i18nConfig', () => {
  it('always lists the default locale as supported', () => {
    expect(i18nConfig.locales).toContain(i18nConfig.defaultLocale);
  });
});

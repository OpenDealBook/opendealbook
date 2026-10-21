import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  marketingGateRedirect,
  marketingRobots,
  marketingSitemap,
} from './config/marketing-gate';
import { stubBootEnv } from './test-env';

describe('featureFlagsConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('turns marketing and billing off from the server env at runtime', async () => {
    stubBootEnv({ ENABLE_MARKETING: 'false', ENABLE_BILLING: 'false' });
    const { featureFlagsConfig } =
      await import('./config/feature-flags.config');

    expect(featureFlagsConfig.enableMarketing).toBe(false);
    expect(featureFlagsConfig.enableBilling).toBe(false);
  });

  it('reads both flags as the env contract parsed them', async () => {
    stubBootEnv({ ENABLE_MARKETING: 'False', ENABLE_BILLING: 'FALSE' });
    const { featureFlagsConfig } =
      await import('./config/feature-flags.config');

    expect(featureFlagsConfig.enableMarketing).toBe(false);
    expect(featureFlagsConfig.enableBilling).toBe(false);
  });
});

describe('marketingGateRedirect', () => {
  it('renders the marketing landing when enabled', () => {
    expect(marketingGateRedirect(true)).toBeNull();
  });

  it('redirects to sign-in when disabled', () => {
    expect(marketingGateRedirect(false)).toBe('/auth/sign-in');
  });
});

describe('marketingRobots', () => {
  it('allows crawling and advertises the sitemap when enabled', () => {
    expect(marketingRobots(true, 'https://example.com/sitemap.xml')).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://example.com/sitemap.xml',
    });
  });

  it('disallows crawling and drops the sitemap when disabled', () => {
    expect(marketingRobots(false, 'https://example.com/sitemap.xml')).toEqual({
      rules: { userAgent: '*', disallow: '/' },
    });
  });
});

describe('marketingSitemap', () => {
  it('lists every static marketing route under the base host when enabled', () => {
    const urls = marketingSitemap(
      { enableMarketing: true, enableBilling: true },
      'https://example.com',
    ).map((entry) => entry.url);

    expect(urls).toEqual([
      'https://example.com',
      'https://example.com/pricing',
      'https://example.com/blog',
      'https://example.com/customers',
      'https://example.com/solutions/corporate-development',
      'https://example.com/security',
      'https://example.com/self-hosting',
      'https://example.com/faq',
      'https://example.com/contact',
      'https://example.com/privacy',
      'https://example.com/terms',
    ]);
  });

  it('returns an empty sitemap when disabled', () => {
    expect(
      marketingSitemap(
        { enableMarketing: false, enableBilling: true },
        'https://example.com',
      ),
    ).toEqual([]);
  });

  it('drops pricing and keeps every other route when billing is off', () => {
    const urls = marketingSitemap(
      { enableMarketing: true, enableBilling: false },
      'https://example.com',
    ).map((entry) => entry.url);

    expect(urls).not.toContain('https://example.com/pricing');
    expect(urls).toHaveLength(10);
  });
});

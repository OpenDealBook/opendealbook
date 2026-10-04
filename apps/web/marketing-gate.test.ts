import { describe, expect, it } from 'vitest';

import { resolveEnableMarketing } from './config/feature-flags.config';
import {
  marketingGateRedirect,
  marketingRobots,
  marketingSitemap,
} from './config/marketing-gate';

describe('resolveEnableMarketing', () => {
  it('enables marketing when the env var is unset', () => {
    expect(resolveEnableMarketing(undefined)).toBe(true);
  });

  it('enables marketing for the string "true"', () => {
    expect(resolveEnableMarketing('true')).toBe(true);
  });

  it('enables marketing for any value other than "false"', () => {
    expect(resolveEnableMarketing('platform')).toBe(true);
  });

  it('disables marketing only for the exact string "false"', () => {
    expect(resolveEnableMarketing('false')).toBe(false);
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
    const urls = marketingSitemap(true, 'https://example.com').map(
      (entry) => entry.url,
    );

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
    expect(marketingSitemap(false, 'https://example.com')).toEqual([]);
  });
});

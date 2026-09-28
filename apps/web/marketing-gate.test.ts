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
  it('lists the site url when enabled', () => {
    const entries = marketingSitemap(true, 'https://example.com');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://example.com');
  });

  it('returns an empty sitemap when disabled', () => {
    expect(marketingSitemap(false, 'https://example.com')).toEqual([]);
  });
});

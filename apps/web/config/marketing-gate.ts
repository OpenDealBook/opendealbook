import type { MetadataRoute } from 'next';

import pathsConfig from './paths.config';

export function marketingGateRedirect(enableMarketing: boolean): string | null {
  return enableMarketing ? null : pathsConfig.auth.signIn;
}

export function marketingRobots(
  enableMarketing: boolean,
  sitemapUrl: string,
): MetadataRoute.Robots {
  if (!enableMarketing) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return { rules: { userAgent: '*', allow: '/' }, sitemap: sitemapUrl };
}

export function marketingSitemap(
  enableMarketing: boolean,
  url: string,
): MetadataRoute.Sitemap {
  if (!enableMarketing) {
    return [];
  }

  return [{ url, lastModified: new Date() }];
}

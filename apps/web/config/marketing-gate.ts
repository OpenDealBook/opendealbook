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

const marketingRoutes: Array<{
  path: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
}> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export function marketingSitemap(
  enableMarketing: boolean,
  baseUrl: string,
): MetadataRoute.Sitemap {
  if (!enableMarketing) {
    return [];
  }

  const lastModified = new Date();

  return marketingRoutes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

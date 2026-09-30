import type { MetadataRoute } from 'next';

import { createCmsClient } from '@odb/keystatic';

import appConfig from '~/config/app.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import { marketingSitemap } from '~/config/marketing-gate';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = marketingSitemap(
    featureFlagsConfig.enableMarketing,
    appConfig.url,
  );

  if (!featureFlagsConfig.enableMarketing) {
    return routes;
  }

  const cms = await createCmsClient();
  const { items } = await cms.getContentItems({
    collection: 'posts',
    status: 'published',
  });

  const posts: MetadataRoute.Sitemap = items.map((post) => ({
    url: `${appConfig.url}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...routes, ...posts];
}

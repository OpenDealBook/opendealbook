import type { MetadataRoute } from 'next';

import appConfig from '~/config/app.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import { marketingSitemap } from '~/config/marketing-gate';

export default function sitemap(): MetadataRoute.Sitemap {
  return marketingSitemap(featureFlagsConfig.enableMarketing, appConfig.url);
}

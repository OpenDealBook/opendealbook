import type { MetadataRoute } from 'next';

import appConfig from '~/config/app.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import { marketingRobots } from '~/config/marketing-gate';

export default function robots(): MetadataRoute.Robots {
  return marketingRobots(
    featureFlagsConfig.enableMarketing,
    `${appConfig.url}/sitemap.xml`,
  );
}

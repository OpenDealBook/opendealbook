import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import appConfig from '~/config/app.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import { marketingRobots } from '~/config/marketing-gate';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();

  return marketingRobots(
    featureFlagsConfig.enableMarketing,
    `${appConfig.url}/sitemap.xml`,
  );
}

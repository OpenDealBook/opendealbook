import { getLogger } from '@odb/shared/logger';

import type { AnalyticsProperties, AnalyticsService } from './types';

export const NullAnalyticsService: AnalyticsService = {
  async identify(userId: string, traits?: AnalyticsProperties) {
    getLogger().debug({ userId, traits }, 'analytics.null.identify');
  },
  async trackEvent(name: string, props?: AnalyticsProperties) {
    getLogger().debug({ name, props }, 'analytics.null.trackEvent');
  },
  async trackPageView(path: string) {
    getLogger().debug({ path }, 'analytics.null.trackPageView');
  },
};

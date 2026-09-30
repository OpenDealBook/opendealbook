import type { PostHog } from 'posthog-js';

import type { AnalyticsProperties, AnalyticsService } from './types';

export function createPostHogAnalyticsService(
  client: PostHog,
): AnalyticsService {
  return {
    async identify(userId: string, traits?: AnalyticsProperties) {
      client.identify(userId, traits);
    },
    async trackEvent(name: string, props?: AnalyticsProperties) {
      client.capture(name, props);
    },
    async trackPageView(path: string) {
      client.capture('$pageview', { $current_url: path });
    },
  };
}

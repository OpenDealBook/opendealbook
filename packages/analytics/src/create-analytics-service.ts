import posthog from 'posthog-js';

import { NullAnalyticsService } from './null-analytics-service';
import { createPostHogAnalyticsService } from './posthog-analytics-service';
import type { AnalyticsService } from './types';

export function createAnalyticsService(): AnalyticsService {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return NullAnalyticsService;
  }

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });

  return createPostHogAnalyticsService(posthog);
}

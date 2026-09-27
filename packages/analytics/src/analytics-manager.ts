import { NullAnalyticsService } from './null-analytics-service';
import type {
  AnalyticsManager,
  AnalyticsProperties,
  AnalyticsService,
} from './types';

export function createAnalyticsManager(
  services: AnalyticsService[] = [],
): AnalyticsManager {
  const active = services.length > 0 ? services : [NullAnalyticsService];

  return {
    identify: async (userId: string, traits?: AnalyticsProperties) => {
      await Promise.all(
        active.map((service) => service.identify(userId, traits)),
      );
    },
    trackEvent: async (name: string, props?: AnalyticsProperties) => {
      await Promise.all(
        active.map((service) => service.trackEvent(name, props)),
      );
    },
    trackPageView: async (path: string) => {
      await Promise.all(active.map((service) => service.trackPageView(path)));
    },
  };
}

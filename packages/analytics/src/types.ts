import { z } from 'zod';

export const analyticsPropertiesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export type AnalyticsProperties = z.infer<typeof analyticsPropertiesSchema>;

export interface AnalyticsService {
  identify(userId: string, traits?: AnalyticsProperties): Promise<void>;
  trackEvent(name: string, props?: AnalyticsProperties): Promise<void>;
  trackPageView(path: string): Promise<void>;
}

export interface AnalyticsManager extends AnalyticsService {}

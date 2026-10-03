'use client';

import { useEffect } from 'react';

import { useAnalytics } from '~/components/analytics-provider';
import { AnalyticsEvents } from '~/config/analytics-events';

export function PricingAnalytics() {
  const analytics = useAnalytics();

  useEffect(() => {
    void analytics.trackEvent(AnalyticsEvents.pricingViewed);
  }, [analytics]);

  return null;
}

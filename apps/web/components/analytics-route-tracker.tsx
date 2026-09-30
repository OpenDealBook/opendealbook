'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { useAnalytics } from '~/components/analytics-provider';

export function AnalyticsRouteTracker() {
  const analytics = useAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    void analytics.trackPageView(pathname);
  }, [analytics, pathname]);

  return null;
}

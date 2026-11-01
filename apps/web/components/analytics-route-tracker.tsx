'use client';

import { useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { useAnalytics } from '~/components/analytics-provider';

export function AnalyticsRouteTracker() {
  const analytics = useAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    void analytics.trackPageView(pathname);
  }, [analytics, pathname]);

  return null;
}

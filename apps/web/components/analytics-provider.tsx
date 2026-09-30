'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  createAnalyticsManager,
  createAnalyticsService,
  type AnalyticsManager,
} from '@odb/analytics';

const AnalyticsContext = createContext<AnalyticsManager | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(
    () => createAnalyticsManager([createAnalyticsService()]),
    [],
  );

  return (
    <AnalyticsContext.Provider value={manager}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsManager {
  const manager = useContext(AnalyticsContext);

  if (!manager) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }

  return manager;
}

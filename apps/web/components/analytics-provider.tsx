'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  createAnalyticsManager,
  type AnalyticsManager,
} from '@tuckin/analytics';

const AnalyticsContext = createContext<AnalyticsManager | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(() => createAnalyticsManager(), []);

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

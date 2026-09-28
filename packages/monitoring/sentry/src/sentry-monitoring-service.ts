import { captureEvent, captureException, setUser } from '@sentry/nextjs';

import type {
  MonitoringContext,
  MonitoringService,
  UserTraits,
} from '@odb/monitoring';

export class SentryMonitoringService implements MonitoringService {
  captureException(error: Error, context?: MonitoringContext) {
    captureException(error, context ? { extra: context } : undefined);
  }

  captureEvent(name: string, data?: Record<string, unknown>) {
    captureEvent({ message: name, extra: data });
  }

  identify(userId: string, traits?: UserTraits) {
    setUser({ id: userId, ...traits });
  }

  initializeMonitoring() {
    return Promise.resolve();
  }
}

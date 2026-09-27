import { getLogger } from '@tuckin/shared/logger';

import type {
  MonitoringContext,
  MonitoringService,
  UserTraits,
} from './monitoring-service';

export class ConsoleMonitoringService implements MonitoringService {
  captureException(error: Error, context?: MonitoringContext) {
    getLogger().error({ err: error, ...context }, 'Captured exception');
  }

  captureEvent(name: string, data?: Record<string, unknown>) {
    getLogger().info({ event: name, ...data }, 'Captured event');
  }

  identify(userId: string, traits?: UserTraits) {
    getLogger().info({ userId, ...traits }, 'Identified user');
  }

  initializeMonitoring() {
    return Promise.resolve();
  }
}

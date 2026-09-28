import { beforeEach, describe, expect, it, vi } from 'vitest';

const error = vi.fn();
const info = vi.fn();

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ error, info }),
}));

import { ConsoleMonitoringService } from './console-monitoring-service';

describe('ConsoleMonitoringService', () => {
  beforeEach(() => {
    error.mockReset();
    info.mockReset();
  });

  it('logs the exception and its context', () => {
    const service = new ConsoleMonitoringService();
    const thrown = new Error('boom');

    service.captureException(thrown, { requestId: 'abc' });

    expect(error).toHaveBeenCalledWith(
      { err: thrown, requestId: 'abc' },
      'Captured exception',
    );
  });

  it('logs the event and its data', () => {
    const service = new ConsoleMonitoringService();

    service.captureEvent('checkout', { plan: 'pro' });

    expect(info).toHaveBeenCalledWith(
      { event: 'checkout', plan: 'pro' },
      'Captured event',
    );
  });

  it('logs the identified user and traits', () => {
    const service = new ConsoleMonitoringService();

    service.identify('user-1', { email: 'a@b.co' });

    expect(info).toHaveBeenCalledWith(
      { userId: 'user-1', email: 'a@b.co' },
      'Identified user',
    );
  });

  it('resolves when initialized', async () => {
    const service = new ConsoleMonitoringService();

    await expect(service.initializeMonitoring()).resolves.toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureException, captureEvent, setUser } = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureEvent: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
  captureEvent,
  setUser,
}));

import { SentryMonitoringService } from './sentry-monitoring-service';

describe('SentryMonitoringService', () => {
  beforeEach(() => {
    captureException.mockReset();
    captureEvent.mockReset();
    setUser.mockReset();
  });

  it('forwards the exception with its context as extra', () => {
    const service = new SentryMonitoringService();
    const thrown = new Error('boom');

    service.captureException(thrown, { requestId: 'abc' });

    expect(captureException).toHaveBeenCalledWith(thrown, {
      extra: { requestId: 'abc' },
    });
  });

  it('forwards the exception without a hint when no context is given', () => {
    const service = new SentryMonitoringService();
    const thrown = new Error('boom');

    service.captureException(thrown);

    expect(captureException).toHaveBeenCalledWith(thrown, undefined);
  });

  it('forwards the event as a message with extra data', () => {
    const service = new SentryMonitoringService();

    service.captureEvent('checkout', { plan: 'pro' });

    expect(captureEvent).toHaveBeenCalledWith({
      message: 'checkout',
      extra: { plan: 'pro' },
    });
  });

  it('identifies the user with id and traits', () => {
    const service = new SentryMonitoringService();

    service.identify('user-1', { email: 'a@b.co' });

    expect(setUser).toHaveBeenCalledWith({ id: 'user-1', email: 'a@b.co' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NullAnalyticsService } from './null-analytics-service';

const debug = vi.fn();

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ debug }),
}));

describe('NullAnalyticsService', () => {
  beforeEach(() => {
    debug.mockClear();
  });

  it('logs identify at debug', async () => {
    await NullAnalyticsService.identify('user-1', { plan: 'pro' });

    expect(debug).toHaveBeenCalledWith(
      { userId: 'user-1', traits: { plan: 'pro' } },
      'analytics.null.identify',
    );
  });

  it('logs trackEvent at debug', async () => {
    await NullAnalyticsService.trackEvent('signup', { source: 'hero' });

    expect(debug).toHaveBeenCalledWith(
      { name: 'signup', props: { source: 'hero' } },
      'analytics.null.trackEvent',
    );
  });

  it('logs trackPageView at debug', async () => {
    await NullAnalyticsService.trackPageView('/pricing');

    expect(debug).toHaveBeenCalledWith(
      { path: '/pricing' },
      'analytics.null.trackPageView',
    );
  });
});

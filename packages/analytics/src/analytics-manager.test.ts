import { describe, expect, it, vi } from 'vitest';

import { createAnalyticsManager } from './analytics-manager';
import type { AnalyticsService } from './types';

const debug = vi.fn();

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ debug }),
}));

function fakeService(): AnalyticsService {
  return {
    identify: vi.fn(async () => {}),
    trackEvent: vi.fn(async () => {}),
    trackPageView: vi.fn(async () => {}),
  };
}

describe('createAnalyticsManager', () => {
  it('forwards identify to every registered service', async () => {
    const a = fakeService();
    const b = fakeService();

    await createAnalyticsManager([a, b]).identify('user-1', { plan: 'pro' });

    expect(a.identify).toHaveBeenCalledWith('user-1', { plan: 'pro' });
    expect(b.identify).toHaveBeenCalledWith('user-1', { plan: 'pro' });
  });

  it('forwards trackEvent to every registered service', async () => {
    const a = fakeService();
    const b = fakeService();

    await createAnalyticsManager([a, b]).trackEvent('signup', {
      source: 'hero',
    });

    expect(a.trackEvent).toHaveBeenCalledWith('signup', { source: 'hero' });
    expect(b.trackEvent).toHaveBeenCalledWith('signup', { source: 'hero' });
  });

  it('forwards trackPageView to every registered service', async () => {
    const a = fakeService();
    const b = fakeService();

    await createAnalyticsManager([a, b]).trackPageView('/pricing');

    expect(a.trackPageView).toHaveBeenCalledWith('/pricing');
    expect(b.trackPageView).toHaveBeenCalledWith('/pricing');
  });

  it('falls back to the null service when none are registered', async () => {
    debug.mockClear();

    await createAnalyticsManager().trackEvent('signup');

    expect(debug).toHaveBeenCalled();
  });
});

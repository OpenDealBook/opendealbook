import type { PostHog } from 'posthog-js';
import { describe, expect, it, vi } from 'vitest';

import { createPostHogAnalyticsService } from './posthog-analytics-service';

function fakeClient() {
  return {
    identify: vi.fn(),
    capture: vi.fn(),
  } as unknown as PostHog;
}

describe('createPostHogAnalyticsService', () => {
  it('forwards identify to the posthog client', async () => {
    const client = fakeClient();

    await createPostHogAnalyticsService(client).identify('user-1', {
      plan: 'pro',
    });

    expect(client.identify).toHaveBeenCalledWith('user-1', { plan: 'pro' });
  });

  it('forwards trackEvent to the posthog client', async () => {
    const client = fakeClient();

    await createPostHogAnalyticsService(client).trackEvent('signup', {
      source: 'hero',
    });

    expect(client.capture).toHaveBeenCalledWith('signup', { source: 'hero' });
  });

  it('forwards trackPageView as a pageview capture', async () => {
    const client = fakeClient();

    await createPostHogAnalyticsService(client).trackPageView('/pricing');

    expect(client.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: '/pricing',
    });
  });
});

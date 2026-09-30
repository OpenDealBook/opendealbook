import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsService } from './create-analytics-service';
import { NullAnalyticsService } from './null-analytics-service';

const { init, capture } = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init,
    capture,
    identify: vi.fn(),
  },
}));

describe('createAnalyticsService', () => {
  beforeEach(() => {
    init.mockClear();
    capture.mockClear();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  it('falls back to the null service when the key is absent', () => {
    expect(createAnalyticsService()).toBe(NullAnalyticsService);
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes posthog with the default us cloud host when the key is set', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';

    createAnalyticsService();

    expect(init).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://us.i.posthog.com',
    });
  });

  it('initializes posthog with a custom host when one is set', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';

    createAnalyticsService();

    expect(init).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://eu.i.posthog.com',
    });
  });

  it('returns a posthog-backed service when the key is set', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';

    await createAnalyticsService().trackEvent('signup', { source: 'hero' });

    expect(capture).toHaveBeenCalledWith('signup', { source: 'hero' });
  });
});

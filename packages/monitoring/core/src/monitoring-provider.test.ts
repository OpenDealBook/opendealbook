import { afterEach, describe, expect, it } from 'vitest';

import { getMonitoringProvider } from './monitoring-provider';

describe('getMonitoringProvider', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MONITORING_PROVIDER;
  });

  it('returns undefined when the provider is unset', () => {
    expect(getMonitoringProvider()).toBeUndefined();
  });

  it('returns the configured provider', () => {
    process.env.NEXT_PUBLIC_MONITORING_PROVIDER = 'sentry';

    expect(getMonitoringProvider()).toBe('sentry');
  });

  it('rejects an unknown provider', () => {
    process.env.NEXT_PUBLIC_MONITORING_PROVIDER = 'datadog';

    expect(() => getMonitoringProvider()).toThrow();
  });
});

import { z } from 'zod';

const MonitoringProviderSchema = z.enum(['sentry', 'console']).optional();

export type MonitoringProvider = z.infer<typeof MonitoringProviderSchema>;

export function getMonitoringProvider(): MonitoringProvider {
  return MonitoringProviderSchema.parse(
    process.env.NEXT_PUBLIC_MONITORING_PROVIDER,
  );
}

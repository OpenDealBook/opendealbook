import { env } from '../env';

export const featureFlagsConfig = {
  enableThemeToggle: true,
  enableTeamAccounts: true,
  enableBilling: env.ENABLE_BILLING,
  enableMarketing: env.ENABLE_MARKETING,
} as const;

export default featureFlagsConfig;

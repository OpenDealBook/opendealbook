export function resolveEnableMarketing(value: string | undefined) {
  return value !== 'false';
}

export const featureFlagsConfig = {
  enableThemeToggle: true,
  enableTeamAccounts: true,
  enablePersonalAccountBilling: true,
  enableMarketing: resolveEnableMarketing(
    process.env.NEXT_PUBLIC_ENABLE_MARKETING,
  ),
} as const;

export default featureFlagsConfig;

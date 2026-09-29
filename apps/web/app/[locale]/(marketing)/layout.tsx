import { notFound } from 'next/navigation';

import featureFlagsConfig from '~/config/feature-flags.config';

import { MarketingShell } from '../_components/marketing-shell';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!featureFlagsConfig.enableMarketing) {
    notFound();
  }

  return <MarketingShell>{children}</MarketingShell>;
}

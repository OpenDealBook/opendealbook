import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import featureFlagsConfig from '~/config/feature-flags.config';

import { MarketingShell } from '../_components/marketing-shell';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  if (!featureFlagsConfig.enableMarketing) {
    notFound();
  }

  return <MarketingShell>{children}</MarketingShell>;
}

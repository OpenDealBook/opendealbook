import { notFound } from 'next/navigation';

import featureFlagsConfig from './feature-flags.config';

export function requireBilling() {
  if (!featureFlagsConfig.enableBilling) {
    notFound();
  }
}

import type { ReactNode } from 'react';

import { Logo } from '@odb/ui/logo';

import { TimezoneDetection } from '../../_components/timezone-detection';
import { ItemFocus } from '../../home/_components/item-focus';
import { SellerPhonePrompt } from './seller-phone-prompt';

export const dynamic = 'force-dynamic';

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={'mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8'}>
      <Logo size={24} wordmark />
      <TimezoneDetection />
      <SellerPhonePrompt />
      <ItemFocus />
      {children}
    </div>
  );
}

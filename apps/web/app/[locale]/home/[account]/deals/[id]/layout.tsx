import type { ReactNode } from 'react';

import { DealSubnav } from '../../../_components/deal-subnav';

export default function TeamDealLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={'flex flex-col'}>
      <div className={'px-8 pt-8'}>
        <DealSubnav />
      </div>
      {children}
    </div>
  );
}

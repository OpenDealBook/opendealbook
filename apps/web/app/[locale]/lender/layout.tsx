import type { ReactNode } from 'react';

import { Logo } from '@odb/ui/logo';

export const dynamic = 'force-dynamic';

export default function LenderLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={
        'mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8 has-[[data-wide]]:max-w-7xl'
      }
    >
      <Logo size={24} wordmark />
      {children}
    </div>
  );
}

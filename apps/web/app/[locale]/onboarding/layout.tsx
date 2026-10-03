import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={'flex min-h-screen items-center justify-center p-6'}>
      {children}
    </div>
  );
}

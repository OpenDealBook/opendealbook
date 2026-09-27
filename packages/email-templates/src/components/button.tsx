import type { ReactNode } from 'react';

import { Button } from 'react-email';

interface EmailButtonProps {
  href: string;
  children: ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button
      href={href}
      className="rounded bg-neutral-950 px-[20px] py-[12px] text-center text-[16px] font-semibold text-white no-underline"
    >
      {children}
    </Button>
  );
}

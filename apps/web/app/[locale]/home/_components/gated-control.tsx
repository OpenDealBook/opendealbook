import type { ReactNode } from 'react';

export function GatedControl({
  allowed,
  reason,
  children,
}: {
  allowed: boolean;
  reason: string;
  children: ReactNode;
}) {
  if (allowed) {
    return children;
  }

  return (
    <fieldset disabled className={'min-w-0 [&_button]:pointer-events-none'}>
      <legend className={'text-muted-foreground mb-2 text-sm'}>{reason}</legend>
      {children}
    </fieldset>
  );
}

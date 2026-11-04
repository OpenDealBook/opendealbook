import type { ReactNode } from 'react';

import { PageTitle } from '#components/page-header';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      data-slot={'empty-state'}
      className={'flex flex-col items-start gap-2 rounded-md border px-8 py-10'}
    >
      {Icon ? (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className={'text-muted-foreground mb-2 size-6'}
        />
      ) : null}
      <PageTitle level={2}>{title}</PageTitle>
      <div className={'text-muted-foreground max-w-prose text-sm'}>
        {description}
      </div>
      {action ? (
        <div className={'mt-4 flex flex-wrap items-center gap-2'}>{action}</div>
      ) : null}
    </section>
  );
}

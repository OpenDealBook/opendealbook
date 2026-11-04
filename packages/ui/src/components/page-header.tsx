import type { ComponentProps, ReactNode } from 'react';

import { cn } from '#lib/utils';

type Level = 1 | 2;

export function PageTitle({
  level = 1,
  className,
  ...props
}: ComponentProps<'h1'> & { level?: Level }) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <Heading
      className={cn(
        'font-serif leading-tight font-medium text-balance break-words outline-none',
        level === 1 ? 'text-3xl' : 'text-2xl',
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  level,
  titleProps,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  level?: Level;
  titleProps?: Pick<ComponentProps<'h1'>, 'id' | 'tabIndex'>;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      className={
        'border-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between'
      }
    >
      <div className={'flex min-w-0 flex-col gap-1.5'}>
        {eyebrow ? (
          <div className={'text-muted-foreground text-sm'}>{eyebrow}</div>
        ) : null}
        <PageTitle level={level} {...titleProps}>
          {title}
        </PageTitle>
        {description ? (
          <div className={'text-muted-foreground max-w-prose text-sm'}>
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className={'flex shrink-0 flex-wrap items-center gap-2'}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

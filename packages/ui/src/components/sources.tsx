import * as React from 'react';

import { cn } from '#lib/utils';
import { BookIcon, ChevronDownIcon } from 'lucide-react';

export type SourcesProps = React.ComponentProps<'details'>;

const Sources = ({ className, ...props }: SourcesProps) => (
  <details
    data-slot="sources"
    className={cn('text-primary group text-xs', className)}
    {...props}
  />
);

export type SourcesTriggerProps = React.ComponentProps<'summary'> & {
  count: number;
};

const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <summary
    data-slot="sources-trigger"
    className={cn('flex cursor-pointer items-center gap-2', className)}
    {...props}
  >
    {children ?? (
      <>
        <span className="font-medium">Used {count} sources</span>
        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
      </>
    )}
  </summary>
);

export type SourcesContentProps = React.ComponentProps<'div'>;

const SourcesContent = ({ className, ...props }: SourcesContentProps) => (
  <div
    data-slot="sources-content"
    className={cn('mt-3 flex w-fit flex-col gap-2', className)}
    {...props}
  />
);

export type SourceProps = React.ComponentProps<'a'> & {
  title?: string;
};

const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    data-slot="source"
    className="text-muted-foreground hover:text-primary flex items-center gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-4 shrink-0" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);

export { Sources, SourcesTrigger, SourcesContent, Source };

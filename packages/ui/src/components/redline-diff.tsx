import * as React from 'react';

import { cn } from '#lib/utils';

type DiffSegment = {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
};

const diffStyles: Record<DiffSegment['type'], string> = {
  unchanged: 'text-muted-foreground',
  added: 'bg-success/10 text-success',
  removed: 'bg-destructive/10 text-destructive line-through',
};

function RedlineDiff({
  segments,
  className,
  ...props
}: React.ComponentProps<'span'> & { segments: DiffSegment[] }) {
  return (
    <span data-slot="redline-diff" className={cn(className)} {...props}>
      {segments.map((segment, index) => (
        <span
          key={index}
          data-diff={segment.type}
          className={diffStyles[segment.type]}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

export { RedlineDiff };

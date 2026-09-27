import * as React from 'react';

import { cn } from '#lib/utils';

type DiffSegment = {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
};

function RedlineDiff({
  segments,
  className,
  ...props
}: React.ComponentProps<'span'> & { segments: DiffSegment[] }) {
  return (
    <span data-slot="redline-diff" className={cn(className)} {...props}>
      {segments.map((segment, index) => (
        <span key={index} data-diff={segment.type}>
          {segment.text}
        </span>
      ))}
    </span>
  );
}

export { RedlineDiff };

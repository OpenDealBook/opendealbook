import * as React from 'react';

import { Badge } from '#components/badge';
import { cn } from '#lib/utils';

function StageChip({
  stage,
  children,
  className,
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Badge> & { stage: string }) {
  return (
    <Badge
      data-slot="stage-chip"
      data-stage={stage}
      variant={variant}
      className={cn(className)}
      {...props}
    >
      {children ?? stage}
    </Badge>
  );
}

export { StageChip };

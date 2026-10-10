import * as React from 'react';

import { cn } from '#lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';

const severityBadgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      severity: {
        info: 'border-transparent bg-brass/10 text-brass',
        warning: 'border-transparent bg-warning/10 text-warning',
        error: 'border-transparent bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      severity: 'info',
    },
  },
);

const severityIcons = {
  info: InfoIcon,
  warning: TriangleAlertIcon,
  error: CircleAlertIcon,
};

export type SeverityBadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof severityBadgeVariants>;

function SeverityBadge({
  className,
  severity = 'info',
  children,
  ...props
}: SeverityBadgeProps) {
  const Icon = severityIcons[severity ?? 'info'];

  return (
    <span
      data-slot="severity-badge"
      className={cn(severityBadgeVariants({ severity }), className)}
      {...props}
    >
      <Icon />
      {children ?? (severity ?? 'info')}
    </span>
  );
}

export { SeverityBadge, severityBadgeVariants };

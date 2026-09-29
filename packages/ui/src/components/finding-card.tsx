import * as React from 'react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/card';
import { SeverityBadge, type SeverityBadgeProps } from '#components/severity-badge';
import { cn } from '#lib/utils';

export type FindingCardProps = {
  title: string;
  severity: NonNullable<SeverityBadgeProps['severity']>;
  description?: React.ReactNode;
  severityLabel?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
} & React.ComponentProps<'div'>;

function FindingCard({
  title,
  severity,
  description,
  severityLabel,
  actions,
  footer,
  className,
  children,
  ...props
}: FindingCardProps) {
  return (
    <Card data-slot="finding-card" className={cn('gap-3', className)} {...props}>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1.5">
          <SeverityBadge severity={severity}>{severityLabel}</SeverityBadge>
          <CardTitle className="truncate">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}

export type FindingListProps = React.ComponentProps<'div'>;

function FindingList({ className, ...props }: FindingListProps) {
  return (
    <div
      data-slot="finding-list"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

export { FindingCard, FindingList };

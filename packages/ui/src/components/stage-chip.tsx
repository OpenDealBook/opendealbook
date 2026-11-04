import * as React from 'react';

import { Badge } from '#components/badge';
import { cn } from '#lib/utils';

const TONES = {
  early: 'border-transparent bg-stage-early text-stage-early-foreground',
  diligence:
    'border-transparent bg-stage-diligence text-stage-diligence-foreground',
  close: 'border-transparent bg-stage-close text-stage-close-foreground',
  lost: 'border-transparent bg-stage-lost text-stage-lost-foreground',
};

type StageTone = keyof typeof TONES;

const STAGE_TONES: Record<string, StageTone> = {
  loi_accepted: 'diligence',
  due_diligence: 'diligence',
  pa_submitted: 'diligence',
  pa_accepted: 'close',
  announcement: 'close',
  integration: 'close',
};

function stageTone(stage: string, lost: boolean): StageTone {
  return lost ? 'lost' : (STAGE_TONES[stage] ?? 'early');
}

function StageChip({
  stage,
  lost = false,
  children,
  className,
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Badge> & { stage: string; lost?: boolean }) {
  return (
    <Badge
      data-slot="stage-chip"
      data-stage={stage}
      variant={variant}
      className={cn(TONES[stageTone(stage, lost)], className)}
      {...props}
    >
      {children ?? stage}
    </Badge>
  );
}

export { StageChip, stageTone, type StageTone };

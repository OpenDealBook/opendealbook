import type { Enums } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';

type RunStatus = Enums<'workflow_run_status'>;

const LABELS: Record<RunStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  awaiting_approval: 'Awaiting approval',
  paused_locked: 'Paused, team locked',
  paused_cap: 'Paused, cap reached',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const VARIANTS: Record<RunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  running: 'default',
  waiting: 'secondary',
  awaiting_approval: 'secondary',
  paused_locked: 'secondary',
  paused_cap: 'secondary',
  succeeded: 'outline',
  failed: 'destructive',
  cancelled: 'outline',
};

export function WorkflowRunStatus({ status }: { status: RunStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}

export const workflowTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

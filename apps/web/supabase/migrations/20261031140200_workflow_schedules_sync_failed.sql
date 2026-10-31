-- When the last schedule sync failed; cleared by the next one that succeeds.
alter table public.workflow add column schedules_sync_failed_at timestamptz;

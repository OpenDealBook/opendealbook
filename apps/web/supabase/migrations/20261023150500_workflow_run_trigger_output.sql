-- What the run's trigger handed its first steps, such as the event that started it.
alter table public.workflow_run add column trigger_output jsonb not null default '{}'::jsonb;

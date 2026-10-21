-- The overdue notices already sent, one per milestone and missed target, so
-- the daily job never repeats a notice and a moved target that is missed
-- again gets a new one. Only the job writes it.

create table if not exists public.deal_milestone_overdue_notice (
  milestone_id uuid not null references public.deal_milestone (id) on delete cascade,
  target_on date not null,
  primary key (milestone_id, target_on)
);

alter table public.deal_milestone_overdue_notice enable row level security;

revoke all on public.deal_milestone_overdue_notice from anon, authenticated, service_role;
grant select, insert on public.deal_milestone_overdue_notice to service_role;

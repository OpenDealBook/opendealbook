create table if not exists public.deal_milestone_overdue_notice (
  milestone_id uuid not null references public.deal_milestone (id) on delete cascade,
  target_on date not null,
  primary key (milestone_id, target_on)
);

alter table public.deal_milestone_overdue_notice enable row level security;

revoke all on public.deal_milestone_overdue_notice from anon, authenticated, service_role;
grant select, insert on public.deal_milestone_overdue_notice to service_role;

-- Milestones already overdue at launch count as notified, so the first run
-- does not flood owners with old misses.
insert into public.deal_milestone_overdue_notice (milestone_id, target_on)
select id, target_on
from public.deal_milestone
where target_on < current_date and actual_on is null;

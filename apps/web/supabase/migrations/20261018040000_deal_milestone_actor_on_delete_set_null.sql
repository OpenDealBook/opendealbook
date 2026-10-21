alter table public.deal_milestone
  drop constraint deal_milestone_created_by_fkey,
  add constraint deal_milestone_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  drop constraint deal_milestone_updated_by_fkey,
  add constraint deal_milestone_updated_by_fkey
    foreign key (updated_by) references auth.users (id) on delete set null;

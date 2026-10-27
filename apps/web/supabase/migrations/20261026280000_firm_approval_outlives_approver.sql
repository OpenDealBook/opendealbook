alter table public.firm_verdict_approval
  alter column approved_by drop not null,
  drop constraint firm_verdict_approval_approved_by_fkey,
  add constraint firm_verdict_approval_approved_by_fkey foreign key (approved_by) references auth.users (id) on delete set null;

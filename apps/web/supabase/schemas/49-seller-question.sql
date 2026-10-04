-- Questions put to the seller during diligence, optionally tied to a schedule
-- week. Deal-scoped; managed with checklists.manage.

create table if not exists public.seller_question (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  schedule_week_id uuid references public.schedule_week (id) on delete set null,
  question text not null,
  answer text,
  status public.checklist_status not null default 'not_started',
  answered_at timestamptz,
  asked_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.seller_question enable row level security;

create index ix_seller_question_deal on public.seller_question (deal_id);
create index ix_seller_question_account on public.seller_question (account_id);

revoke all on public.seller_question from authenticated, service_role;
grant select, insert, update, delete on public.seller_question to authenticated;
grant select, insert, update, delete on public.seller_question to service_role;

create trigger seller_question_timestamps
  before insert or update on public.seller_question
  for each row execute function public.set_timestamps();

create policy seller_question_read on public.seller_question
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
  );

create policy seller_question_insert on public.seller_question
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

-- Buyer-account members with checklists.manage edit questions; a seller
-- participant on the deal may also write, so they can fill in answer.
create policy seller_question_update on public.seller_question
  for update to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'checklists.manage')
    or exists (
      select 1 from public.deal_participant p
      where p.deal_id = seller_question.deal_id
        and p.user_id = (select auth.uid())
        and p.party = 'seller'
        and (p.expires_at is null or p.expires_at > now())
    )
  )
  with check (
    public.has_permission((select auth.uid()), account_id, 'checklists.manage')
    or exists (
      select 1 from public.deal_participant p
      where p.deal_id = seller_question.deal_id
        and p.user_id = (select auth.uid())
        and p.party = 'seller'
        and (p.expires_at is null or p.expires_at > now())
    )
  );

create policy seller_question_delete on public.seller_question
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

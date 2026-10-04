-- Buyer-private notes on a seller question. These are internal to the buyer
-- account: access is gated on buyer-account membership only, never on
-- has_deal_permission, so a seller deal_participant (who is not a member of the
-- buyer account) can never read or write them. Numbered to sort after
-- 49-seller-question.sql, whose seller_question table it references.

create table if not exists public.seller_question_note (
  id uuid primary key default gen_random_uuid(),
  seller_question_id uuid not null references public.seller_question (id) on delete cascade,
  deal_id uuid not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  note text not null,
  author_user_id uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.seller_question_note enable row level security;

create index ix_seller_question_note_question on public.seller_question_note (seller_question_id);

revoke all on public.seller_question_note from authenticated, service_role;
grant select, insert, update, delete on public.seller_question_note to authenticated;
grant select, insert, update, delete on public.seller_question_note to service_role;

create trigger seller_question_note_timestamps
  before insert or update on public.seller_question_note
  for each row execute function public.set_timestamps();

create trigger seller_question_note_user_tracking
  before insert or update on public.seller_question_note
  for each row execute function public.set_user_tracking();

create policy seller_question_note_read on public.seller_question_note
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy seller_question_note_insert on public.seller_question_note
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy seller_question_note_update on public.seller_question_note
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy seller_question_note_delete on public.seller_question_note
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

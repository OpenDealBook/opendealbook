-- A team's mailed-letter copy: plain text with merge fields, rendered to simple
-- HTML when a workflow sends it.
create table if not exists public.letter_template (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.letter_template enable row level security;

create index ix_letter_template_account on public.letter_template (account_id);

revoke all on public.letter_template from anon, authenticated, service_role;
grant select, insert, update, delete on public.letter_template to authenticated;
grant select, insert, update, delete on public.letter_template to service_role;

create trigger letter_template_timestamps
  before insert or update on public.letter_template
  for each row execute function public.set_timestamps();

create trigger letter_template_user_tracking
  before insert or update on public.letter_template
  for each row execute function public.set_user_tracking();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.letter_template
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.letter_template
  for each row execute function tuckin.refuse_personal_account_row();

create policy letter_template_read on public.letter_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy letter_template_insert on public.letter_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy letter_template_update on public.letter_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy letter_template_delete on public.letter_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

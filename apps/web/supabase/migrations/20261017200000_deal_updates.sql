-- An update the deal team broadcasts once a second person approves it. The
-- team reads updates but changes them only through the functions below, which
-- hold the state machine: draft, then pending, then approved or rejected; a
-- rejected update is revised back to pending; a draft or pending update can be
-- withdrawn.

create type public.deal_update_status as enum ('draft', 'pending', 'approved', 'rejected', 'withdrawn');

create type public.deal_update_decision as enum ('approved', 'rejected');

create table if not exists public.deal_update (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  author_id uuid references auth.users on delete set null,
  subject text not null,
  body text not null,
  status public.deal_update_status not null default 'draft',
  version int not null default 1,
  submitted_at timestamptz,
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (decided_by is null or decided_by <> author_id),
  check (status <> 'rejected' or decision_note is not null)
);

create index if not exists ix_deal_update_deal on public.deal_update (deal_id, created_at);

alter table public.deal_update enable row level security;

revoke all on public.deal_update from anon, authenticated, service_role;
grant select on public.deal_update to authenticated;
grant select, insert, update, delete on public.deal_update to service_role;

create policy deal_update_read on public.deal_update
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function public.authored_deal_update(update_id uuid)
  returns public.deal_update
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if the_update.author_id is distinct from (select auth.uid())
    or not public.manages_deal_in_account(the_update.deal_id, the_update.account_id) then
    raise exception 'only the author can change an update' using errcode = 'insufficient_privilege';
  end if;
  return the_update;
end;
$$;

revoke all on function public.authored_deal_update(uuid) from public, anon, authenticated;

create or replace function public.submit_deal_update(update_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status <> 'draft' then
    raise exception 'only a draft can be submitted';
  end if;
  update public.deal_update set status = 'pending', submitted_at = now() where id = update_id;
end;
$$;

create or replace function public.edit_deal_update(update_id uuid, subject text, body text)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status not in ('pending', 'rejected') then
    raise exception 'only a pending or rejected update can be edited';
  end if;
  update public.deal_update u
  set subject = edit_deal_update.subject, body = edit_deal_update.body,
    status = 'pending', version = u.version + 1
  where u.id = update_id;
end;
$$;

create or replace function public.withdraw_deal_update(update_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status not in ('draft', 'pending') then
    raise exception 'only a draft or pending update can be withdrawn';
  end if;
  update public.deal_update set status = 'withdrawn' where id = update_id;
end;
$$;

create or replace function public.decide_deal_update(
  update_id uuid, expected_version int, decision public.deal_update_decision, note text
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if not public.has_permission((select auth.uid()), the_update.account_id, 'deal_updates.approve') then
    raise exception 'not allowed to approve deal updates' using errcode = 'insufficient_privilege';
  end if;
  if the_update.author_id = (select auth.uid()) then
    raise exception 'the author cannot decide their own update' using errcode = 'insufficient_privilege';
  end if;
  if the_update.status <> 'pending' then
    raise exception 'only a pending update can be decided';
  end if;
  if the_update.version <> expected_version then
    raise exception 'this update changed since it was opened';
  end if;
  update public.deal_update
  set status = decision::text::public.deal_update_status, decided_by = (select auth.uid()),
    decided_at = now(), decision_note = note
  where id = update_id;
end;
$$;

revoke all on function public.submit_deal_update(uuid) from public, anon;
revoke all on function public.edit_deal_update(uuid, text, text) from public, anon;
revoke all on function public.withdraw_deal_update(uuid) from public, anon;
revoke all on function public.decide_deal_update(uuid, int, public.deal_update_decision, text) from public, anon;
grant execute on function public.submit_deal_update(uuid) to authenticated, service_role;
grant execute on function public.edit_deal_update(uuid, text, text) to authenticated, service_role;
grant execute on function public.withdraw_deal_update(uuid) to authenticated, service_role;
grant execute on function public.decide_deal_update(uuid, int, public.deal_update_decision, text) to authenticated, service_role;

-- ---- Billing lock ----
-- 'members' binds the team's own users, so a locked team can neither write nor
-- approve an update.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_update
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_update
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

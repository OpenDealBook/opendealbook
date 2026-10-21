alter table public.deal_update add column picks jsonb not null;

alter table public.deal_update drop constraint deal_update_check1;
alter table public.deal_update add constraint deal_update_rejection_noted
  check (status <> 'rejected' or coalesce(btrim(decision_note), '') <> '');

drop policy deal_update_read on public.deal_update;
create policy deal_update_read on public.deal_update
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    and (status <> 'draft' or author_id = (select auth.uid()))
  );

create table if not exists public.deal_update_recipient (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.deal_update (id) on delete cascade,
  user_id uuid references auth.users,
  contact_id uuid references public.contact (id),
  email text not null,
  name text,
  entries public.deal_person_entry[] not null,
  sent_at timestamptz,
  failed_at timestamptz,
  error text,
  check ((user_id is null) <> (contact_id is null))
);

create index if not exists ix_deal_update_recipient_update on public.deal_update_recipient (update_id);

alter table public.deal_update_recipient enable row level security;

revoke all on public.deal_update_recipient from anon, authenticated, service_role;
grant select on public.deal_update_recipient to authenticated;
grant select, insert, update, delete on public.deal_update_recipient to service_role;

create policy deal_update_recipient_read on public.deal_update_recipient
  for select to authenticated
  using (exists (
    select 1 from public.deal_update u
    where u.id = update_id and public.has_role_on_account(u.account_id)
  ));

create or replace function public.create_deal_update(deal_id uuid, subject text, body text, picks jsonb)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  made_id uuid;
begin
  insert into public.deal_update (account_id, deal_id, author_id, subject, body, picks)
  select d.account_id, d.id, (select auth.uid()), create_deal_update.subject, create_deal_update.body,
    create_deal_update.picks
  from public.deal d
  where d.id = create_deal_update.deal_id and public.manages_deal_in_account(d.id, d.account_id)
  returning id into made_id;
  if made_id is null then
    raise exception 'not allowed to manage this deal' using errcode = 'insufficient_privilege';
  end if;
  return made_id;
end;
$$;

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
    raise exception 'not allowed to change this update' using errcode = 'insufficient_privilege';
  end if;
  return the_update;
end;
$$;

drop function public.edit_deal_update(uuid, text, text);
drop function public.decide_deal_update(uuid, int, public.deal_update_decision, text);

create or replace function public.edit_deal_update(update_id uuid, subject text, body text, picks jsonb)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status not in ('draft', 'pending', 'rejected') then
    raise exception 'only a draft, pending or rejected update can be edited';
  end if;
  update public.deal_update u
  set subject = edit_deal_update.subject, body = edit_deal_update.body, picks = edit_deal_update.picks,
    status = case when u.status = 'draft' then 'draft' else 'pending' end::public.deal_update_status,
    version = u.version + 1
  where u.id = update_id;
end;
$$;

create or replace function public.decide_deal_update(
  update_id uuid, expected_version int, decision public.deal_update_decision, note text, recipients jsonb
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
  insert into public.deal_update_recipient (update_id, user_id, contact_id, email, name, entries)
  select decide_deal_update.update_id, r.user_id, r.contact_id, r.email, r.name, r.entries
  from jsonb_populate_recordset(null::public.deal_update_recipient, recipients) r
  where decision = 'approved';
end;
$$;

revoke all on function public.create_deal_update(uuid, text, text, jsonb) from public, anon;
revoke all on function public.edit_deal_update(uuid, text, text, jsonb) from public, anon;
revoke all on function public.decide_deal_update(uuid, int, public.deal_update_decision, text, jsonb) from public, anon;
grant execute on function public.create_deal_update(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.edit_deal_update(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.decide_deal_update(uuid, int, public.deal_update_decision, text, jsonb)
  to authenticated, service_role;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_update_recipient
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'update_id', 'deal_update');

create trigger same_team_contact_id
  before insert or update on public.deal_update_recipient
  for each row execute function tuckin.refuse_cross_team_link('update_id', 'deal_update', 'contact_id', 'contact');

-- Team slugs follow the team name, and former slugs keep resolving.
-- Compiled from tuckin.assign_team_slug and accounts_slug_on_rename in
-- supabase/schemas/04-accounts.sql and from
-- supabase/schemas/05a-account-slug-history.sql; edit those files, not this one.

create or replace function tuckin.assign_team_slug()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  base text := tuckin.slugify(new.name);
  candidate text := base;
  suffix int := 1;
begin
  while exists (select 1 from public.accounts where slug = candidate and id <> new.id) loop
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger accounts_slug_on_rename
  before update on public.accounts
  for each row when (new.name is distinct from old.name and not new.is_personal_account)
  execute function tuckin.assign_team_slug();

create table if not exists public.account_slug_history (
  slug text primary key,
  account_id uuid not null references public.accounts on delete cascade
);

comment on table public.account_slug_history is 'Former team slugs, each pointing at the team that last held it.';

alter table public.account_slug_history enable row level security;

create index ix_account_slug_history_account_id on public.account_slug_history (account_id);

revoke all on public.account_slug_history from authenticated, service_role;
grant select on public.account_slug_history to authenticated;
grant select, insert, update, delete on public.account_slug_history to service_role;

create policy account_slug_history_read on public.account_slug_history
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function tuckin.record_former_slug()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.account_slug_history where slug = new.slug and account_id = new.id;
  insert into public.account_slug_history (slug, account_id) values (old.slug, new.id);
  return new;
end;
$$;

create trigger accounts_record_former_slug
  after update on public.accounts
  for each row when (old.slug is distinct from new.slug)
  execute function tuckin.record_former_slug();

create or replace function public.team_account_current_slug(former_slug text)
  returns text
  set search_path = '' as $$
  select a.slug
  from public.account_slug_history h
  join public.accounts a on a.id = h.account_id
  where h.slug = former_slug;
$$ language sql stable;

grant execute on function public.team_account_current_slug(text) to authenticated, service_role;

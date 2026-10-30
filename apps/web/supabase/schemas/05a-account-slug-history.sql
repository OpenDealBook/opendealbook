-- Slugs a team has left behind, so old /home/<slug> URLs keep resolving to the
-- team's current slug across any number of renames.

create table if not exists public.account_slug_history (
  slug text primary key,
  account_id uuid not null references public.accounts on delete cascade
);

comment on table public.account_slug_history is 'Former team slugs, each pointing at the team that last held it.';

alter table public.account_slug_history enable row level security;

create index ix_account_slug_history_account_id on public.account_slug_history (account_id);

revoke all on public.account_slug_history from authenticated, service_role;
grant select on public.account_slug_history to authenticated;

create policy account_slug_history_read on public.account_slug_history
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function odb.record_former_slug()
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
  execute function odb.record_former_slug();

create or replace function public.team_account_current_slug(former_slug text)
  returns text
  set search_path = '' as $$
  select a.slug
  from public.account_slug_history h
  join public.accounts a on a.id = h.account_id
  where h.slug = former_slug;
$$ language sql stable;

grant execute on function public.team_account_current_slug(text) to authenticated;

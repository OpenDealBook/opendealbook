-- Former team slugs are reserved: a new team or a rename that would land on
-- another team's former slug gets a counter suffix, as for a live slug.
-- Compiled from tuckin.assign_team_slug and accounts_slug_on_insert in
-- supabase/schemas/04-accounts.sql; edit that file, not this one.

create or replace function tuckin.assign_team_slug()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  base text := case when tg_op = 'INSERT' then coalesce(new.slug, tuckin.slugify(new.name)) else tuckin.slugify(new.name) end;
  candidate text := base;
  suffix int := 1;
begin
  while exists (select 1 from public.accounts where slug = candidate and id <> new.id)
    or exists (select 1 from public.account_slug_history where slug = candidate and account_id <> new.id) loop
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger accounts_slug_on_insert on public.accounts;

create trigger accounts_slug_on_insert
  before insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function tuckin.assign_team_slug();

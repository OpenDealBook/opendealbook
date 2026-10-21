-- A team slug changes only through a rename, fits in 64 characters with its
-- counter suffix, and a name with no letter or number is refused.
-- Compiled from tuckin.assign_team_slug and the accounts column grants in
-- supabase/schemas/04-accounts.sql and the grants in
-- supabase/schemas/05a-account-slug-history.sql; edit those files, not this one.

revoke update (slug) on public.accounts from authenticated;

create or replace function tuckin.assign_team_slug()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  base text := case when tg_op = 'INSERT' then coalesce(new.slug, tuckin.slugify(new.name)) else tuckin.slugify(new.name) end;
  candidate text := rtrim(left(base, 64), '-');
  suffix int := 0;
begin
  if base = '' then
    raise exception 'team name must contain a letter or number';
  end if;
  while exists (select 1 from public.accounts where slug = candidate and id <> new.id)
    or exists (select 1 from public.account_slug_history where slug = candidate and account_id <> new.id) loop
    suffix := suffix + 1;
    candidate := rtrim(left(base, 63 - length(suffix::text)), '-') || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

revoke all on public.account_slug_history from service_role;
revoke execute on function public.team_account_current_slug(text) from service_role;

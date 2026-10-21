-- A team slug never takes a static route under /home; a reserved word gets a
-- counter suffix like any taken slug.
-- Compiled from tuckin.assign_team_slug in supabase/schemas/04-accounts.sql;
-- edit that file, not this one.

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
  while candidate in ('settings', 'create-team', 'deals', 'billing', 'todos', 'outreach', 'underwriting', 'counsel')
    or exists (select 1 from public.accounts where slug = candidate and id <> new.id)
    or exists (select 1 from public.account_slug_history where slug = candidate and account_id <> new.id) loop
    suffix := suffix + 1;
    candidate := rtrim(left(base, 63 - length(suffix::text)), '-') || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

-- How a team's background search shows a name found in several spellings:
-- the spelling from the highest priority source, or the one from the newest
-- record. Members with settings.manage set it through the accounts_update
-- policy.

create type public.diligence_name_spelling as enum ('source_priority', 'newest_record');

alter table public.accounts
  add column diligence_name_spelling public.diligence_name_spelling not null default 'source_priority';

grant update (diligence_name_spelling) on public.accounts to authenticated;

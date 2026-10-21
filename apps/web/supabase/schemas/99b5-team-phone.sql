-- A team's own phone, the seller's fallback when the deal owner has none. Set
-- through the same accounts_update policy as the team's name.

alter table public.accounts add column team_phone text;

alter table public.accounts add constraint accounts_team_phone check (
  team_phone is null or not is_personal_account
);

alter table public.accounts add constraint accounts_team_phone_length check (
  length(team_phone) <= 50
);

grant update (team_phone) on public.accounts to authenticated;

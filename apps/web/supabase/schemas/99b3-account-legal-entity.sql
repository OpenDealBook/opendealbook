-- A team's legal entity name, for documents that name the buying entity. Set
-- through the same accounts_update policy as the team's name.

alter table public.accounts add column legal_entity_name text;

alter table public.accounts add constraint accounts_team_legal_entity_name check (
  legal_entity_name is null or not is_personal_account
);

grant update (legal_entity_name) on public.accounts to authenticated;

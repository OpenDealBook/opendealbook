-- The team a person last worked in, kept on their personal account so the app
-- reopens it. It names only a team the person belongs to when it is saved.

alter table public.accounts
  add column last_team_account_id uuid references public.accounts (id) on delete set null;

alter table public.accounts add constraint accounts_personal_last_team check (
  last_team_account_id is null or is_personal_account
);

grant update (last_team_account_id) on public.accounts to authenticated;

create or replace function odb.require_last_team_membership()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not exists (
    select 1 from public.accounts_memberships
    where account_id = new.last_team_account_id and user_id = new.primary_owner_user_id
  ) then
    raise exception 'the last-used team must be a team the person belongs to' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger require_last_team_membership
  before insert or update of last_team_account_id on public.accounts
  for each row when (new.last_team_account_id is not null)
  execute function odb.require_last_team_membership();

-- Compiled from supabase/schemas/28-api-key.sql and supabase/schemas/99c-billing-lock.sql.

create or replace function tuckin.refuse_locked_api_key_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  written public.api_key;
begin
  if tg_op = 'UPDATE' then
    perform tuckin.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op = 'DELETE' then
    written := old;
  else
    written := new;
  end if;

  if tuckin.team_locked(written.account_id)
    and public.has_role_on_account(written.account_id)
    and not (
      tg_op = 'UPDATE'
      and old.revoked_at is null
      and new.revoked_at is not null
      and to_jsonb(old) - 'revoked_at' = to_jsonb(new) - 'revoked_at'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refuse_write_when_team_locked on public.api_key;
create trigger refuse_write_when_team_locked
  before insert or update or delete on public.api_key
  for each row execute function tuckin.refuse_locked_api_key_change();

create trigger revoke_api_keys_without_holder
  after update of primary_owner_user_id on public.accounts
  for each statement execute function tuckin.revoke_api_keys_without_holder();

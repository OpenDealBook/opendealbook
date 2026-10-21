-- Compiled from supabase/schemas/28-api-key.sql.

create or replace function tuckin.refuse_api_key_unrevoke()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if old.revoked_at is not null and new.revoked_at is null and auth.uid() is not null then
    raise exception 'a revoked API key stays revoked' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger refuse_api_key_unrevoke
  before update on public.api_key
  for each row execute function tuckin.refuse_api_key_unrevoke();

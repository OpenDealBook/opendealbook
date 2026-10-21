-- Compiled from supabase/schemas/99c-billing-lock.sql; edit that file, not this one.

create or replace function tuckin.team_locked(target_account_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_set('enable_team_account_billing') and exists (
    select 1 from public.accounts a
    where a.id = target_account_id
      and not a.is_personal_account
      and not exists (
        select 1 from public.subscriptions s
        where s.account_id = a.id and s.status in ('active', 'trialing', 'past_due')
      )
      and (
        exists (
          select 1 from public.subscriptions s
          where s.account_id = a.id and s.status in ('canceled', 'unpaid', 'incomplete_expired')
        )
        or (
          a.trial_ends_at <= now()
          and not exists (
            select 1 from public.subscriptions s
            where s.account_id = a.id and s.status in ('paused', 'incomplete')
          )
        )
      )
  );
$$;

create or replace function tuckin.refuse_team_move_of(old_row jsonb, new_row jsonb)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null
    and (old_row -> 'account_id' is distinct from new_row -> 'account_id'
      or old_row -> 'deal_id' is distinct from new_row -> 'deal_id'
      or old_row -> 'room_id' is distinct from new_row -> 'room_id') then
    raise exception 'rows cannot move between teams' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function tuckin.refuse_team_move()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  perform tuckin.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

create or replace function tuckin.team_of_row(written_row jsonb, account_column text, parent_table text)
  returns uuid
  language plpgsql stable security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
begin
  if parent_table is null then
    return (written_row ->> account_column)::uuid;
  end if;
  execute format('select account_id from public.%I where id = ($1 ->> %L)::uuid', parent_table, account_column)
    into target_account_id using written_row;
  return target_account_id;
end;
$$;

create or replace function tuckin.refuse_write_when_team_locked()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  team_ids uuid[] := '{}';
  team_id uuid;
begin
  if tg_op = 'UPDATE' then
    perform tuckin.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    team_ids := team_ids || tuckin.team_of_row(to_jsonb(old), tg_argv[1], tg_argv[2]);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    team_ids := team_ids || tuckin.team_of_row(to_jsonb(new), tg_argv[1], tg_argv[2]);
  end if;

  foreach team_id in array team_ids loop
    if tuckin.team_locked(team_id) and public.has_role_on_account(team_id) then
      raise exception 'team is read-only' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function tuckin.refuse_locked_ask_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  written public.lender_ask;
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
      and new.status in ('answered', 'closed')
      and to_jsonb(old) - 'status' - 'first_response_at' = to_jsonb(new) - 'status' - 'first_response_at'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function tuckin.refuse_locked_membership_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    perform tuckin.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tuckin.team_locked(new.account_id)
    and not (
      tg_op = 'UPDATE'
      and public.is_account_owner(new.account_id)
      and to_jsonb(old) - 'account_role' - 'updated_at' - 'updated_by'
        = to_jsonb(new) - 'account_role' - 'updated_at' - 'updated_by'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger refuse_write_when_team_locked on public.accounts_memberships;

create trigger refuse_write_when_team_locked
  before insert or update on public.accounts_memberships
  for each row execute function tuckin.refuse_locked_membership_change();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_ask
  for each row execute function tuckin.refuse_locked_ask_change();

delete from tuckin.billing_lock_exempt_tables where table_name = 'lender_ask';

create trigger refuse_team_move
  before update on public.account_slug_history
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.activity_pool_key
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.billing_customers
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.calendar_connection
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.comp_pool_key
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.deal_event_snapshot
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.deal_star
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.document_chunk
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.duplicate_candidate
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.embedding_job
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.integration_connection
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.lender_room_activity
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.mailbox_connection
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.nonces
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.notification_preference
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.notifications
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.orders
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.personal_todo
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.saved_view
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.search_document
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.subscriptions
  for each row execute function tuckin.refuse_team_move();

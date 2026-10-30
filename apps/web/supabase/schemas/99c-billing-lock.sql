-- A team is locked read-only once billing has lapsed: no subscription is
-- active, trialing or past due, and either one was canceled, went unpaid or
-- expired before its first payment, or the team never subscribed and its trial
-- ended. Personal accounts never lock, and nothing locks while team billing is
-- off. The web app writes config.enable_team_account_billing from
-- ENABLE_BILLING at boot.
--
-- The lock binds the team's own users only. Lenders, sellers and server jobs
-- write as non-members and pass, except that nobody joins a locked team.

create or replace function public.set_team_account_billing(enabled boolean)
  returns void
  language sql
  set search_path = '' as $$
  update public.config set enable_team_account_billing = set_team_account_billing.enabled where true;
$$;

revoke all on function public.set_team_account_billing(boolean) from public, anon, authenticated;
grant execute on function public.set_team_account_billing(boolean) to service_role;
grant update (enable_team_account_billing) on public.config to service_role;

create or replace function odb.team_locked(target_account_id uuid)
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

create or replace function public.is_account_locked(target_account_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null and not public.has_role_on_account(target_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  return odb.team_locked(target_account_id);
end;
$$;

revoke all on function public.is_account_locked(uuid) from public, anon;
grant execute on function public.is_account_locked(uuid) to authenticated, service_role;

create type public.billing_standing as enum ('good', 'past_due', 'locked');

create or replace function public.team_billing_standing(target_account_id uuid)
  returns public.billing_standing
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null and not public.has_role_on_account(target_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  if odb.team_locked(target_account_id) then
    return 'locked';
  end if;
  if public.is_set('enable_team_account_billing')
    and exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status = 'past_due'
    )
    and not exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status in ('active', 'trialing')
    ) then
    return 'past_due';
  end if;
  return 'good';
end;
$$;

revoke all on function public.team_billing_standing(uuid) from public, anon;
grant execute on function public.team_billing_standing(uuid) to authenticated, service_role;

-- No signed-in user moves a row to another team, deal or lender room.
create or replace function odb.refuse_team_move_of(old_row jsonb, new_row jsonb)
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

create or replace function odb.refuse_team_move()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

-- Arguments: 'members' (the lock binds the team's own users), the column
-- holding the account id, and optionally the parent table that column points
-- into.
create or replace function odb.team_of_row(written_row jsonb, account_column text, parent_table text)
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

create or replace function odb.refuse_write_when_team_locked()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  team_ids uuid[] := '{}';
  team_id uuid;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    team_ids := team_ids || odb.team_of_row(to_jsonb(old), tg_argv[1], tg_argv[2]);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    team_ids := team_ids || odb.team_of_row(to_jsonb(new), tg_argv[1], tg_argv[2]);
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and team_ids[1] is distinct from team_ids[2] then
    raise exception 'rows cannot move between teams' using errcode = 'insufficient_privilege';
  end if;

  foreach team_id in array team_ids loop
    if odb.team_locked(team_id) and public.has_role_on_account(team_id) then
      raise exception 'team is read-only' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- A row's link to a team's row points within the row's own team; a shared row
-- (no team) links to no team's row. Rows that break a not-null or foreign key
-- constraint are left for that constraint to report.
-- Arguments: the row's account column and optional parent table (as for the
-- lock trigger, '' for none), then the link column and the table it points to.
create or replace function odb.refuse_cross_team_link()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  own_ref text := to_jsonb(new) ->> tg_argv[0];
  linked_team uuid := odb.team_of_row(to_jsonb(new), tg_argv[2], tg_argv[3]);
  own_parent_exists boolean;
begin
  if linked_team is null then
    return new;
  end if;

  if own_ref is null then
    if exists (
      select 1 from pg_attribute
      where attrelid = tg_relid and attname = tg_argv[0] and attnotnull
    ) then
      return new;
    end if;
  elsif tg_argv[1] <> '' then
    execute format('select exists (select 1 from public.%I where id = $1::uuid)', tg_argv[1])
      into own_parent_exists using own_ref;
    if not own_parent_exists then
      return new;
    end if;
  end if;

  if odb.team_of_row(to_jsonb(new), tg_argv[0], nullif(tg_argv[1], '')) is distinct from linked_team then
    raise exception 'rows cannot link across teams' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Links between team tables that need no same-team check.
create table if not exists odb.cross_team_link_exempt (
  table_name text not null,
  column_name text not null,
  reason text not null,
  primary key (table_name, column_name)
);

insert into odb.cross_team_link_exempt (table_name, column_name, reason) values
  ('orders', 'billing_customer_id', 'billing rows are written only by the billing webhook'),
  ('subscriptions', 'billing_customer_id', 'billing rows are written only by the billing webhook')
on conflict (table_name, column_name) do update set reason = excluded.reason;

-- A locked team may still reply to and close lender asks; nothing else.
create or replace function odb.refuse_locked_ask_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  written public.lender_ask;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op = 'DELETE' then
    written := old;
  else
    written := new;
  end if;

  if odb.team_locked(written.account_id)
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

-- A locked team may still revoke API keys, so a demotion or removal can always
-- kill the keys it orphans; nothing else.
create or replace function odb.refuse_locked_api_key_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  written public.api_key;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op = 'DELETE' then
    written := old;
  else
    written := new;
  end if;

  if odb.team_locked(written.account_id)
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

-- Nobody joins a locked team; its owner may still change members' roles.
create or replace function odb.refuse_locked_membership_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if odb.team_locked(new.account_id)
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

-- Team storage objects are keyed by account id or, in the deal buckets, by
-- deal id in the second path segment.
create or replace function public.storage_object_team_locked(bucket text, object_name text)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
begin
  if bucket in ('templates', 'generated', 'contracts', 'vendor-imports', 'buyer-profile') then
    target_account_id := ((storage.foldername(object_name))[1])::uuid;
  elsif bucket in ('data-room', 'meeting-recordings') then
    select account_id into target_account_id from public.deal
    where id = ((storage.foldername(object_name))[2])::uuid;
  end if;
  return odb.team_locked(target_account_id) and public.has_role_on_account(target_account_id);
end;
$$;

revoke all on function public.storage_object_team_locked(text, text) from public, anon;
grant execute on function public.storage_object_team_locked(text, text) to authenticated;

create policy team_lock_objects_insert on storage.objects
  as restrictive for insert to authenticated
  with check (not public.storage_object_team_locked(bucket_id, name));

create policy team_lock_objects_update on storage.objects
  as restrictive for update to authenticated
  using (not public.storage_object_team_locked(bucket_id, name))
  with check (not public.storage_object_team_locked(bucket_id, name));

create policy team_lock_objects_delete on storage.objects
  as restrictive for delete to authenticated
  using (not public.storage_object_team_locked(bucket_id, name));

-- Team tables with an account path that a locked team may still write.
create table if not exists odb.billing_lock_exempt_tables (
  table_name text primary key,
  reason text not null
);

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('billing_customers', 'billing stays open so the owner can resubscribe'),
  ('subscriptions', 'billing stays open so the owner can resubscribe'),
  ('orders', 'billing stays open so the owner can resubscribe'),
  ('lender_room_activity', 'recorded when people view a room'),
  ('nonces', 'sign-in plumbing'),
  ('account_slug_history', 'written only by a rename, which is locked'),
  ('search_document', 'derived index, written by server jobs'),
  ('activity_pool_key', 'derived index, written by server jobs'),
  ('comp_pool_key', 'derived index, written by server jobs'),
  ('document_chunk', 'derived index, written by server jobs'),
  ('embedding_job', 'derived index, written by server jobs'),
  ('deal_event_snapshot', 'derived from deal_event, which is locked'),
  ('duplicate_candidate', 'derived by server jobs'),
  ('notifications', 'one user''s own data inside the team'),
  ('notification_preference', 'one user''s own data inside the team'),
  ('deal_star', 'one user''s own data inside the team'),
  ('saved_view', 'one user''s own data inside the team'),
  ('personal_todo', 'one user''s own data inside the team'),
  ('calendar_connection', 'one user''s own data inside the team'),
  ('mailbox_connection', 'one user''s own data inside the team'),
  ('integration_connection', 'one user''s own data inside the team'),
  ('seller_send_limit', 'service-role only, written by super-admins')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.account_slug_history
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.activity_pool_key
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.billing_customers
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.calendar_connection
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.comp_pool_key
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.deal_event_snapshot
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.deal_star
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.document_chunk
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.duplicate_candidate
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.embedding_job
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.integration_connection
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.lender_room_activity
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.mailbox_connection
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.nonces
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.notification_preference
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.notifications
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.orders
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.personal_todo
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.saved_view
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.search_document
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.subscriptions
  for each row execute function odb.refuse_team_move();

create trigger same_team_deal_id
  before insert or update on public.activity_pool_key
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.ai_call_log
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_endpoint_id
  before insert or update on public.ai_call_log
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'endpoint_id', 'llm_endpoint');

create trigger same_team_firm_id
  before insert or update on public.broker_intake
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_submitted_by_contact_id
  before insert or update on public.broker_intake
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'submitted_by_contact_id', 'contact');

create trigger same_team_deal_id
  before insert or update on public.calc_version
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.checklist_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_week_id
  before insert or update on public.checklist_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_deal_id
  before insert or update on public.client_transition
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.comp
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_license_id
  before insert or update on public.comp_import
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'license_id', 'comp_license');

create trigger same_team_deal_id
  before insert or update on public.comp_pool_key
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_comp_id
  before insert or update on public.comp_set_member
  for each row execute function odb.refuse_cross_team_link('comp_set_id', 'comp_set', 'comp_id', 'comp');

create trigger same_team_firm_id
  before insert or update on public.contact
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_deal_id
  before insert or update on public.contract
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_contract_id
  before insert or update on public.contract_version
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'contract_id', 'contract');

create trigger same_team_broker_contact_id
  before insert or update on public.deal
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'broker_contact_id', 'contact');

create trigger same_team_duplicate_of
  before insert or update on public.deal
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'duplicate_of', 'deal');

create trigger same_team_firm_id
  before insert or update on public.deal
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_calc_version_id
  before insert or update on public.deal_calc_input
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_deal_box_id
  before insert or update on public.deal_calc_input
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_box_id', 'deal_box');

create trigger same_team_imported_from_version_id
  before insert or update on public.deal_calc_input
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'imported_from_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.deal_discovery
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_event
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_event_snapshot
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_financials
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_source_calc_version_id
  before insert or update on public.deal_financials
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'source_calc_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.deal_operating_period
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_profile
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_industry_id
  before insert or update on public.deal_profile
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'industry_id', 'industry');

create trigger same_team_location_id
  before insert or update on public.deal_profile
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'location_id', 'location');

create trigger same_team_deal_id
  before insert or update on public.deal_star
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_thesis
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_value_marker
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_worksheet_row
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.diligence_schedule
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.document_chunk
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_document_id
  before insert or update on public.document_chunk
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'document_id', 'dr_document');

create trigger same_team_deal_id
  before insert or update on public.dr_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.dr_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.dr_folder
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_candidate_deal_id
  before insert or update on public.duplicate_candidate
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'candidate_deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.duplicate_candidate
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.embedding_job
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.embedding_job
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'dr_document_id', 'dr_document');

create trigger same_team_deal_id
  before insert or update on public.employee
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_calc_version_id
  before insert or update on public.funding_source
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_contract_id
  before insert or update on public.generated_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'contract_id', 'contract');

create trigger same_team_deal_id
  before insert or update on public.generated_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.generated_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'template_id', 'document_template');

create trigger same_team_deal_id
  before insert or update on public.hr_audit_engagement
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_report_document_id
  before insert or update on public.hr_audit_engagement
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'report_document_id', 'dr_document');

create trigger same_team_parent_id
  before insert or update on public.industry
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'parent_id', 'industry');

create trigger same_team_deal_id
  before insert or update on public.lender_faq_entry
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_ask_id
  before insert or update on public.lender_faq_source
  for each row execute function odb.refuse_cross_team_link('entry_id', 'lender_faq_entry', 'ask_id', 'lender_ask');

create trigger same_team_dr_folder_id
  before insert or update on public.lender_oversize_file
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'dr_folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.lender_package
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_master_folder_id
  before insert or update on public.lender_package
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'master_folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.lender_room
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_private_folder_id
  before insert or update on public.lender_room
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'private_folder_id', 'dr_folder');

create trigger same_team_dr_folder_id
  before insert or update on public.lender_room_hidden
  for each row execute function odb.refuse_cross_team_link('room_id', 'lender_room', 'dr_folder_id', 'dr_folder');

create trigger same_team_folder_id
  before insert or update on public.lender_upload
  for each row execute function odb.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.meeting
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_series_id
  before insert or update on public.meeting
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'series_id', 'meeting_series');

create trigger same_team_checklist_item_id
  before insert or update on public.meeting_action_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'checklist_item_id', 'checklist_item');

create trigger same_team_deal_id
  before insert or update on public.meeting_action_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_meeting_id
  before insert or update on public.meeting_action_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'meeting_id', 'meeting');

create trigger same_team_schedule_week_id
  before insert or update on public.meeting_action_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_deal_id
  before insert or update on public.meeting_series
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.notification_preference
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.notifications
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.offer
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_offer_id
  before insert or update on public.offer_version
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'offer_id', 'offer');

create trigger same_team_contact_id
  before insert or update on public.outreach_enrollment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'contact_id', 'contact');

create trigger same_team_firm_id
  before insert or update on public.outreach_enrollment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_sequence_id
  before insert or update on public.outreach_enrollment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'sequence_id', 'outreach_sequence');

create trigger same_team_sequence_id
  before insert or update on public.outreach_step
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'sequence_id', 'outreach_sequence');

create trigger same_team_deal_id
  before insert or update on public.personal_todo
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_id
  before insert or update on public.schedule_week
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'schedule_id', 'diligence_schedule');

create trigger same_team_period_id
  before insert or update on public.sde_line
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'period_id', 'sde_period');

create trigger same_team_calc_version_id
  before insert or update on public.sde_period
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.search_document
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.upload_batch
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.upload_item
  for each row execute function odb.refuse_cross_team_link('batch_id', 'upload_batch', 'dr_document_id', 'dr_document');

create trigger same_team_target_folder_id
  before insert or update on public.upload_item
  for each row execute function odb.refuse_cross_team_link('batch_id', 'upload_batch', 'target_folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.verification_finding
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.verification_finding
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'dr_document_id', 'dr_document');

create trigger same_team_run_id
  before insert or update on public.verification_finding
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'run_id', 'verification_run');

create trigger same_team_deal_id
  before insert or update on public.verification_run
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.workbook
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'template_id', 'workbook_template');

create trigger same_team_workbook_id
  before insert or update on public.workbook_run
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'workbook_id', 'workbook');

create trigger same_team_deal_id
  before insert or update on public.seller_question
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_week_id
  before insert or update on public.seller_question
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_seller_question_id
  before insert or update on public.seller_question_note
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'seller_question_id', 'seller_question');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.ai_call_log
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.api_key
  for each row execute function odb.refuse_locked_api_key_change();

create trigger refuse_write_when_team_locked
  before update on public.accounts
  for each row execute function odb.refuse_write_when_team_locked('members', 'id');

create trigger refuse_write_when_team_locked
  before insert or update on public.accounts_memberships
  for each row execute function odb.refuse_locked_membership_change();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_ask
  for each row execute function odb.refuse_locked_ask_change();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.agent
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.approval
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.attachment
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.broker_intake
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.buyer_profile
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.calc_version
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_item
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_template
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_template_item
  for each row execute function odb.refuse_write_when_team_locked('members', 'template_id', 'checklist_template');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.client_transition
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_import
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_license
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_pool_optin
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_search_recipe
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_set
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_set_member
  for each row execute function odb.refuse_write_when_team_locked('members', 'comp_set_id', 'comp_set');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contact
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_version
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.data_source
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_box
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_calc_defaults
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_calc_input
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_discovery
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_event
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_financials
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_operating_period
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_participant
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_profile
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_thesis
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_value_marker
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_worksheet_row
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_schedule
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.document_template
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.dr_document
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.dr_folder
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.employee
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.funding_source
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.generated_document
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.hr_audit_engagement
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.industry
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.invitations
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_entry
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_file
  for each row execute function odb.refuse_write_when_team_locked('members', 'entry_id', 'lender_faq_entry');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_hidden
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_source
  for each row execute function odb.refuse_write_when_team_locked('members', 'entry_id', 'lender_faq_entry');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_upload
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_form_signature
  for each row execute function odb.refuse_write_when_team_locked('members', 'ask_id', 'lender_ask');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_oversize_file
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_package
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_hidden
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_member
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_removed_member
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_upload
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.llm_endpoint
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.location
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting_action_item
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting_series
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.offer
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.offer_version
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_enrollment
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_message
  for each row execute function odb.refuse_write_when_team_locked('members', 'enrollment_id', 'outreach_enrollment');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_sequence
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_setting
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_step
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_suppression
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.pipeline_stage
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.schedule_week
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.sde_line
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.sde_period
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_question
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_question_note
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.template_field
  for each row execute function odb.refuse_write_when_team_locked('members', 'template_id', 'document_template');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.upload_batch
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.upload_item
  for each row execute function odb.refuse_write_when_team_locked('members', 'batch_id', 'upload_batch');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.verification_finding
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.verification_run
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook_run
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook_template
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');


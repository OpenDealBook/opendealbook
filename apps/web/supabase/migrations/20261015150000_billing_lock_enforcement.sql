-- Compiled from supabase/schemas/99c-billing-lock.sql and public.is_trial_active in
-- supabase/schemas/42-trial.sql; edit those files, not this one.

create or replace function public.is_trial_active(p_account_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null and not public.has_role_on_account(p_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  return exists (
    select 1 from public.accounts a
    where a.id = is_trial_active.p_account_id
      and (a.trial_ends_at is null or a.trial_ends_at > now())
  );
end;
$$;

revoke all on function public.is_trial_active(uuid) from public, anon;
grant execute on function public.is_trial_active(uuid) to authenticated, service_role;

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
        or a.trial_ends_at <= now()
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
  return tuckin.team_locked(target_account_id);
end;
$$;

revoke all on function public.is_account_locked(uuid) from public, anon;
grant execute on function public.is_account_locked(uuid) to authenticated, service_role;

-- Arguments: who is refused ('members' or 'anyone'), the column holding the
-- account id, and optionally the parent table that column points into.
create or replace function tuckin.refuse_write_when_team_locked()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  written_row jsonb;
  target_account_id uuid;
begin
  if tg_op = 'DELETE' then
    written_row := to_jsonb(old);
  else
    written_row := to_jsonb(new);
  end if;

  if tg_nargs = 2 then
    target_account_id := (written_row ->> tg_argv[1])::uuid;
  else
    execute format('select account_id from public.%I where id = ($1 ->> %L)::uuid', tg_argv[2], tg_argv[1])
      into target_account_id using written_row;
  end if;

  if tuckin.team_locked(target_account_id)
    and (tg_argv[0] = 'anyone' or public.has_role_on_account(target_account_id)) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Team tables with an account path that a locked team may still write.
create table if not exists tuckin.billing_lock_exempt_tables (
  table_name text primary key,
  reason text not null
);

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('billing_customers', 'billing stays open so the owner can resubscribe'),
  ('subscriptions', 'billing stays open so the owner can resubscribe'),
  ('orders', 'billing stays open so the owner can resubscribe'),
  ('lender_ask', 'the team still answers and closes lender asks'),
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
  ('notifications', 'pending ruling: per-user data on a team'),
  ('notification_preference', 'pending ruling: per-user data on a team'),
  ('deal_star', 'pending ruling: per-user data on a team'),
  ('saved_view', 'pending ruling: per-user data on a team'),
  ('personal_todo', 'pending ruling: per-user data on a team'),
  ('calendar_connection', 'pending ruling: per-user data on a team'),
  ('mailbox_connection', 'pending ruling: per-user data on a team'),
  ('integration_connection', 'pending ruling: per-user data on a team'),
  ('api_key', 'pending ruling: per-user data on a team'),
  ('ai_call_log', 'pending ruling: asking AI about a deal'),
  ('document_share', 'pending: the seller lane holds its schema file')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_write_when_team_locked
  before update on public.accounts
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'id');

create trigger refuse_write_when_team_locked
  before insert or update on public.accounts_memberships
  for each row execute function tuckin.refuse_write_when_team_locked('anyone', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.agent
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.approval
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.attachment
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.broker_intake
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.buyer_profile
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.calc_version
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_item
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_template
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.checklist_template_item
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'template_id', 'checklist_template');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.client_transition
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_import
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_license
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_pool_optin
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_search_recipe
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_set
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.comp_set_member
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'comp_set_id', 'comp_set');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_version
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.data_source
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_box
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_calc_input
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_discovery
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_event
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_financials
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_operating_period
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_participant
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_profile
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_thesis
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_value_marker
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_worksheet_row
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_schedule
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.document_template
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.dr_document
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.dr_folder
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.employee
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.funding_source
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.generated_document
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.hr_audit_engagement
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.industry
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.invitations
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_form_signature
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'ask_id', 'lender_ask');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_oversize_file
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_package
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_hidden
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_member
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_removed_member
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_upload
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.llm_endpoint
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.location
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting_action_item
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.meeting_series
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.offer
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.offer_version
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_enrollment
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_message
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'enrollment_id', 'outreach_enrollment');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_sequence
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_setting
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_step
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_suppression
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.pipeline_stage
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.schedule_week
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.sde_line
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.sde_period
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_question
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_question_note
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.template_field
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'template_id', 'document_template');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.upload_batch
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.upload_item
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'batch_id', 'upload_batch');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.verification_finding
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.verification_run
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook_run
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workbook_template
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');


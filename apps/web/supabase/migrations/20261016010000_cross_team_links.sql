-- Compiled from supabase/schemas/99c-billing-lock.sql; edit that file, not this one.

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

  if tg_op = 'UPDATE' and auth.uid() is not null and team_ids[1] is distinct from team_ids[2] then
    raise exception 'rows cannot move between teams' using errcode = 'insufficient_privilege';
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

-- A row's link to a team's row points within the row's own team; a shared row
-- (no team) links to no team's row. Rows that break a not-null or foreign key
-- constraint are left for that constraint to report.
-- Arguments: the row's account column and optional parent table (as for the
-- lock trigger, '' for none), then the link column and the table it points to.
create or replace function tuckin.refuse_cross_team_link()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  own_ref text := to_jsonb(new) ->> tg_argv[0];
  linked_team uuid := tuckin.team_of_row(to_jsonb(new), tg_argv[2], tg_argv[3]);
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

  if tuckin.team_of_row(to_jsonb(new), tg_argv[0], nullif(tg_argv[1], '')) is distinct from linked_team then
    raise exception 'rows cannot link across teams' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Links between team tables that need no same-team check.
create table if not exists tuckin.cross_team_link_exempt (
  table_name text not null,
  column_name text not null,
  reason text not null,
  primary key (table_name, column_name)
);

insert into tuckin.cross_team_link_exempt (table_name, column_name, reason) values
  ('orders', 'billing_customer_id', 'billing rows are written only by the billing webhook'),
  ('subscriptions', 'billing_customer_id', 'billing rows are written only by the billing webhook')
on conflict (table_name, column_name) do update set reason = excluded.reason;

create trigger same_team_deal_id
  before insert or update on public.activity_pool_key
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.ai_call_log
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_endpoint_id
  before insert or update on public.ai_call_log
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'endpoint_id', 'llm_endpoint');

create trigger same_team_firm_id
  before insert or update on public.broker_intake
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_submitted_by_contact_id
  before insert or update on public.broker_intake
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'submitted_by_contact_id', 'contact');

create trigger same_team_deal_id
  before insert or update on public.calc_version
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.checklist_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_week_id
  before insert or update on public.checklist_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_deal_id
  before insert or update on public.client_transition
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.comp
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_license_id
  before insert or update on public.comp_import
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'license_id', 'comp_license');

create trigger same_team_deal_id
  before insert or update on public.comp_pool_key
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_comp_id
  before insert or update on public.comp_set_member
  for each row execute function tuckin.refuse_cross_team_link('comp_set_id', 'comp_set', 'comp_id', 'comp');

create trigger same_team_firm_id
  before insert or update on public.contact
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_deal_id
  before insert or update on public.contract
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_contract_id
  before insert or update on public.contract_version
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_id', 'contract');

create trigger same_team_broker_contact_id
  before insert or update on public.deal
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'broker_contact_id', 'contact');

create trigger same_team_duplicate_of
  before insert or update on public.deal
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'duplicate_of', 'deal');

create trigger same_team_firm_id
  before insert or update on public.deal
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_calc_version_id
  before insert or update on public.deal_calc_input
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_deal_box_id
  before insert or update on public.deal_calc_input
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_box_id', 'deal_box');

create trigger same_team_imported_from_version_id
  before insert or update on public.deal_calc_input
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'imported_from_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.deal_discovery
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_event
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_event_snapshot
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_financials
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_source_calc_version_id
  before insert or update on public.deal_financials
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'source_calc_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.deal_operating_period
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_profile
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_industry_id
  before insert or update on public.deal_profile
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'industry_id', 'industry');

create trigger same_team_location_id
  before insert or update on public.deal_profile
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'location_id', 'location');

create trigger same_team_deal_id
  before insert or update on public.deal_star
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_thesis
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_value_marker
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_worksheet_row
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.diligence_schedule
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.document_chunk
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_document_id
  before insert or update on public.document_chunk
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'document_id', 'dr_document');

create trigger same_team_checklist_item_id
  before insert or update on public.dr_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'checklist_item_id', 'checklist_item');

create trigger same_team_deal_id
  before insert or update on public.dr_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.dr_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.dr_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_candidate_deal_id
  before insert or update on public.duplicate_candidate
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'candidate_deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.duplicate_candidate
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.embedding_job
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.embedding_job
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'dr_document_id', 'dr_document');

create trigger same_team_deal_id
  before insert or update on public.employee
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_calc_version_id
  before insert or update on public.funding_source
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_contract_id
  before insert or update on public.generated_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_id', 'contract');

create trigger same_team_deal_id
  before insert or update on public.generated_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.generated_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'template_id', 'document_template');

create trigger same_team_deal_id
  before insert or update on public.hr_audit_engagement
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_report_document_id
  before insert or update on public.hr_audit_engagement
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'report_document_id', 'dr_document');

create trigger same_team_parent_id
  before insert or update on public.industry
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'parent_id', 'industry');

create trigger same_team_dr_folder_id
  before insert or update on public.lender_oversize_file
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'dr_folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.lender_package
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_master_folder_id
  before insert or update on public.lender_package
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'master_folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.lender_room
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_private_folder_id
  before insert or update on public.lender_room
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'private_folder_id', 'dr_folder');

create trigger same_team_dr_folder_id
  before insert or update on public.lender_room_hidden
  for each row execute function tuckin.refuse_cross_team_link('room_id', 'lender_room', 'dr_folder_id', 'dr_folder');

create trigger same_team_folder_id
  before insert or update on public.lender_upload
  for each row execute function tuckin.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');

create trigger same_team_deal_id
  before insert or update on public.meeting
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_series_id
  before insert or update on public.meeting
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'series_id', 'meeting_series');

create trigger same_team_checklist_item_id
  before insert or update on public.meeting_action_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'checklist_item_id', 'checklist_item');

create trigger same_team_deal_id
  before insert or update on public.meeting_action_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_meeting_id
  before insert or update on public.meeting_action_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'meeting_id', 'meeting');

create trigger same_team_schedule_week_id
  before insert or update on public.meeting_action_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_deal_id
  before insert or update on public.meeting_series
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.notification_preference
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.offer
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_offer_id
  before insert or update on public.offer_version
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'offer_id', 'offer');

create trigger same_team_contact_id
  before insert or update on public.outreach_enrollment
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contact_id', 'contact');

create trigger same_team_firm_id
  before insert or update on public.outreach_enrollment
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger same_team_sequence_id
  before insert or update on public.outreach_enrollment
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'sequence_id', 'outreach_sequence');

create trigger same_team_sequence_id
  before insert or update on public.outreach_step
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'sequence_id', 'outreach_sequence');

create trigger same_team_deal_id
  before insert or update on public.personal_todo
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_id
  before insert or update on public.schedule_week
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'schedule_id', 'diligence_schedule');

create trigger same_team_period_id
  before insert or update on public.sde_line
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'period_id', 'sde_period');

create trigger same_team_calc_version_id
  before insert or update on public.sde_period
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger same_team_deal_id
  before insert or update on public.search_document
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.upload_batch
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.upload_item
  for each row execute function tuckin.refuse_cross_team_link('batch_id', 'upload_batch', 'dr_document_id', 'dr_document');

create trigger same_team_target_folder_id
  before insert or update on public.upload_item
  for each row execute function tuckin.refuse_cross_team_link('batch_id', 'upload_batch', 'target_folder_id', 'dr_folder');

create trigger same_team_checklist_item_id
  before insert or update on public.verification_finding
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'checklist_item_id', 'checklist_item');

create trigger same_team_deal_id
  before insert or update on public.verification_finding
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.verification_finding
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'dr_document_id', 'dr_document');

create trigger same_team_run_id
  before insert or update on public.verification_finding
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'run_id', 'verification_run');

create trigger same_team_deal_id
  before insert or update on public.verification_run
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.workbook
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'template_id', 'workbook_template');

create trigger same_team_workbook_id
  before insert or update on public.workbook_run
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'workbook_id', 'workbook');

create trigger same_team_deal_id
  before insert or update on public.seller_question
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_schedule_week_id
  before insert or update on public.seller_question
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'schedule_week_id', 'schedule_week');

create trigger same_team_seller_question_id
  before insert or update on public.seller_question_note
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'seller_question_id', 'seller_question');

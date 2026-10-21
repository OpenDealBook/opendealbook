-- Compiled from supabase/schemas/99t-team-owned-deal-work.sql, 42-trial.sql,
-- 99g-deal-people.sql and 99s-workflows.sql.

alter table public.workflow_run
  add constraint workflow_run_account_id_fkey foreign key (account_id) references public.accounts (id) on delete cascade;

-- All deal work belongs to a team. A personal account holds only its owner's
-- profile, so every table with an account refuses a row on a personal account
-- unless it is listed in tuckin.personal_account_tables. Tables that hang from a
-- deal or room carry no account and are held to a team through that parent.

create table if not exists tuckin.personal_account_tables (
  table_name text primary key,
  reason text not null
);

insert into tuckin.personal_account_tables (table_name, reason) values
  ('notifications', 'addressed to the person'),
  ('nonces', 'sign-in plumbing'),
  ('account_slug_history', 'names the account once had')
on conflict (table_name) do update set reason = excluded.reason;

create or replace function tuckin.refuse_personal_account_row()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.accounts
    where id = (to_jsonb(new) ->> 'account_id')::uuid and is_personal_account
  ) then
    raise exception 'deal work belongs to a team, not a personal account' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_personal_account_row
  before insert or update of account_id on public.account_event
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.accounts_memberships
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.activity_pool_key
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.agent
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.ai_call_log
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.api_key
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.attachment
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.broker_intake
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.business_match_review
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.buyer_profile
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.calc_version
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.calendar_connection
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.checklist_item
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.checklist_template
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.client_transition
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_import
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_license
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_pool_key
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_pool_optin
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_search_recipe
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.comp_set
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contact
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_comment
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_version
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.counsel_activity
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.counsel_message
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.data_source
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_box
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_calc_defaults
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_calc_input
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_checklist_application
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_close_deadline
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_contact
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_counsel
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_counsel_removed
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_discovery
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_event
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_event_snapshot
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_financials
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_milestone
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_operating_period
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_profile
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_star
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_terms_sought
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_thesis
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_update
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_value_marker
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_worksheet_row
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.decision_fact
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_schedule
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.document_chunk
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.document_share
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.document_template
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.dr_document
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.dr_folder
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.duplicate_candidate
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.embedding_job
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.employee
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.firm
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.firm_email
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.firm_verdict
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.firm_verdict_approval
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.firm_verdict_revocation
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.funding_source
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.generated_document
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.hr_audit_engagement
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.industry
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.integration_connection
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.invitations
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_ask
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_contact
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_faq_entry
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_nudge_setting
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_outreach_template
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_oversize_file
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_package
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_room
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_room_activity
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_room_email_reply
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_room_outreach
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.llm_endpoint
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.location
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.mailbox_connection
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.meeting
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.meeting_action_item
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.meeting_series
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.notification_preference
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.offer
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.offer_version
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_enrollment
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_letter
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_sequence
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_setting
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_step
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.outreach_suppression
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.paid_lookup
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.personal_todo
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.pipeline_stage
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.provider_credential
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.saved_view
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.schedule_week
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.sde_line
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.sde_period
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.search_document
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_question
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_question_note
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_room
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_room_activity
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_room_question
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_send_limit
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.upload_batch
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.verification_finding
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.verification_run
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workbook
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workbook_run
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workbook_template
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_approval
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_run
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_step_log
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_step_run
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_trigger
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_version
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.billing_customers
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.orders
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.subscriptions
  for each row execute function tuckin.refuse_personal_account_row();

create or replace function tuckin.provision_personal_account()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  display_name text := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    ''
  );
begin
  insert into public.accounts (id, primary_owner_user_id, name, is_personal_account, email, picture_url)
  values (
    new.id,
    new.id,
    display_name,
    true,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

create or replace function public.create_team_account(account_name text, user_id uuid, account_slug text default null)
  returns public.accounts
  language plpgsql security definer
  set search_path = '' as $$
declare
  team public.accounts;
begin
  if not public.is_set('enable_team_accounts') then
    raise exception 'team accounts are disabled';
  end if;

  insert into public.accounts (name, slug, is_personal_account, primary_owner_user_id, trial_ends_at)
  values (account_name, account_slug, false, user_id, now() + interval '30 days')
  returning * into team;

  insert into public.accounts_memberships (account_id, user_id, account_role)
  values (team.id, user_id, public.get_upper_system_role());

  perform public.seed_default_pipeline_stages(team.id);

  return team;
end;
$$;

create or replace function public.deal_people(deal_id uuid)
  returns table (
    user_id uuid,
    email text,
    name text,
    entries public.deal_person_entry[]
  )
  language sql stable security definer
  set search_path = '' as $$
  with the_deal as (
    select d.id, d.account_id, a.name::text as team_name
    from public.deal d
    join public.accounts a on a.id = d.account_id
    where d.id = deal_people.deal_id and public.has_role_on_account(d.account_id)
  ),
  team as (
    select am.user_id, the_deal.team_name
    from the_deal
    join public.accounts_memberships am on am.account_id = the_deal.account_id
  ),
  pulled as (
    select t.user_id, 'team' as source, a.name::text as name, a.phone, t.team_name as company,
      'buyer'::public.deal_side as side, 'principal' as role, null::uuid as lender_room_id,
      null::boolean as room_closed
    from team t
    join public.accounts a on a.primary_owner_user_id = t.user_id and a.is_personal_account
    union all
    select m.user_id, 'lender_room', p.name, pa.phone, r.name, 'lender', 'lender', r.id,
      not public.lender_room_is_open(r) or r.status = 'declined'
    from the_deal
    join public.lender_room r on r.deal_id = the_deal.id
    join public.lender_room_member m on m.room_id = r.id
    left join public.lender_person p on p.user_id = m.user_id
    left join public.accounts pa on pa.primary_owner_user_id = m.user_id and pa.is_personal_account
    union all
    select m.user_id, 'seller_room', m.name, pa.phone, null, 'seller', 'seller', null,
      not public.seller_room_is_open(r)
    from the_deal
    join public.seller_room r on r.deal_id = the_deal.id
    join public.seller_room_member m on m.room_id = r.id
    left join public.accounts pa on pa.primary_owner_user_id = m.user_id and pa.is_personal_account
    union all
    select c.user_id, 'counsel', c.name, c.phone, c.company, c.side::text::public.deal_side, 'attorney', null, null
    from the_deal
    join public.deal_counsel c on c.deal_id = the_deal.id
  ),
  entry as (
    select p.user_id, lower(u.email) as email, coalesce(lower(u.email), p.user_id::text) as person,
      row(p.source, null, p.name, p.phone, p.company, p.side, p.role, p.lender_room_id, p.room_closed,
        exists (
          select 1 from public.deal_main_contact mc
          where mc.deal_id = deal_people.deal_id and mc.side = p.side
            and mc.lender_room_id is not distinct from p.lender_room_id and mc.user_id = p.user_id
        ))::public.deal_person_entry as e
    from pulled p
    join auth.users u on u.id = p.user_id
    union all
    select null, lower(c.email), coalesce(lower(c.email), c.id::text),
      row('contact', c.id, c.name, c.phone, c.company, dc.side, dc.role::text, null, null,
        exists (
          select 1 from public.deal_main_contact mc
          where mc.deal_id = dc.deal_id and mc.side = dc.side and mc.contact_id = c.id
        ))::public.deal_person_entry
    from the_deal
    join public.deal_contact dc on dc.deal_id = the_deal.id
    join public.contact c on c.id = dc.contact_id
  )
  select person.user_id, person.email, coalesce(a.name::text, person.contact_name), person.entries
  from (
    select (array_agg(entry.user_id) filter (where entry.user_id is not null))[1] as user_id,
      min(entry.email) as email,
      (array_agg((entry.e).name order by (entry.e).contact_id)
        filter (where (entry.e).source = 'contact'))[1] as contact_name,
      array_agg(entry.e order by (entry.e).source, (entry.e).lender_room_id, (entry.e).contact_id) as entries
    from entry
    group by entry.person
  ) person
  left join public.accounts a on a.primary_owner_user_id = person.user_id and a.is_personal_account;
$$;

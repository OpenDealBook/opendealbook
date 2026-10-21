alter table public.checklist_template add column is_default boolean not null default false;

create unique index checklist_template_one_default on public.checklist_template (account_id, kind) where is_default;

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      ev.payload ->> 'category',
      ev.payload ->> 'title',
      (ev.payload ->> 'owner_user_id')::uuid,
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      coalesce((ev.payload ->> 'priority')::int, 0),
      coalesce((ev.payload ->> 'deal_killer')::boolean, false),
      (ev.payload ->> 'schedule_week_id')::uuid,
      (ev.payload ->> 'due_offset_days')::int,
      ev.payload ->> 'kind',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'importance',
      ev.payload ->> 'answer',
      ev.payload ->> 'offer_term_key',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      category = excluded.category,
      title = excluded.title,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      priority = excluded.priority,
      deal_killer = excluded.deal_killer,
      schedule_week_id = excluded.schedule_week_id,
      due_offset_days = excluded.due_offset_days,
      kind = excluded.kind,
      owner_role = excluded.owner_role,
      importance = excluded.importance,
      answer = excluded.answer,
      offer_term_key = excluded.offer_term_key,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'checklist_item.status_changed' then
    update public.checklist_item set
      status = (ev.payload ->> 'status')::public.checklist_status,
      requested_at = coalesce((ev.payload ->> 'requested_at')::timestamptz, requested_at),
      received_at = coalesce((ev.payload ->> 'received_at')::timestamptz, received_at),
      reviewed_at = coalesce((ev.payload ->> 'reviewed_at')::timestamptz, reviewed_at),
      reviewed_by = coalesce((ev.payload ->> 'reviewed_by')::uuid, reviewed_by),
      outcome = coalesce((ev.payload ->> 'outcome')::public.checklist_outcome, outcome),
      answer = coalesce(ev.payload ->> 'answer', answer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.due_recomputed' then
    update public.checklist_item set
      due_at = (ev.payload ->> 'due_at')::timestamptz,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.rescheduled' then
    update public.checklist_item set
      schedule_week_id = (ev.payload ->> 'schedule_week_id')::uuid,
      priority = coalesce((ev.payload ->> 'priority')::int, priority),
      deal_killer = coalesce((ev.payload ->> 'deal_killer')::boolean, deal_killer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;

-- Starter templates for a team: diligence and closing checklists plus the two
-- post-close plans. A template the team already has by name and kind is left
-- as it is; a default is set only where the team has none of that kind.
-- Diligence offsets count days after the LOI is signed, closing offsets are
-- negative days from the target close, and post-close offsets count days after
-- the actual close.
create or replace function public.seed_starter_checklist_templates(p_account_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  with starter(name, kind, make_default) as (
    values
      ('Standard Diligence', 'diligence', true),
      ('Standard Closing', 'closing', true),
      ('Day 0 Takeover', 'post_close', true),
      ('First 90 Days', 'post_close', false)
  ),
  created as (
    insert into public.checklist_template (account_id, name, kind)
    select p_account_id, s.name, s.kind
    from starter s
    where not exists (
      select 1 from public.checklist_template t
      where t.account_id = p_account_id and t.name = s.name and t.kind = s.kind
    )
    returning id, name
  )
  insert into public.checklist_template_item (template_id, category, title, due_offset_days, owner_role, importance, sort_order)
  select c.id, v.category, v.title, v.due_offset_days, v.owner_role, v.importance, v.sort_order
  from created c
  join (values
    ('Standard Diligence', 'Financial', '3 years business tax returns', 7, null, null, 1),
    ('Standard Diligence', 'Financial', '3 years P&L and balance sheets, plus year-to-date', 7, null, null, 2),
    ('Standard Diligence', 'Financial', '24 months bank statements', 10, null, null, 3),
    ('Standard Diligence', 'Financial', 'Proof of add-backs (owner salary, personal expenses)', 14, null, null, 4),
    ('Standard Diligence', 'Financial', 'AR and AP aging', 14, null, null, 5),
    ('Standard Diligence', 'Financial', 'Quality of earnings review', 30, null, null, 6),
    ('Standard Diligence', 'Customers', 'Top 10 customers with revenue share', 10, null, null, 7),
    ('Standard Diligence', 'Customers', 'Customer contracts and recurring agreements', 14, null, null, 8),
    ('Standard Diligence', 'Customers', 'Customer interviews (with seller''s okay)', 30, null, null, 9),
    ('Standard Diligence', 'Employees', 'Employee list with roles, pay and tenure', 10, null, null, 10),
    ('Standard Diligence', 'Employees', 'Key employee retention plan', 21, null, null, 11),
    ('Standard Diligence', 'Employees', 'Payroll records and benefits summary', 14, null, null, 12),
    ('Standard Diligence', 'Legal', 'Entity documents and good standing', 7, null, null, 13),
    ('Standard Diligence', 'Legal', 'Licenses and permits', 14, null, null, 14),
    ('Standard Diligence', 'Legal', 'Lease and landlord consent to assign', 21, null, null, 15),
    ('Standard Diligence', 'Legal', 'Pending or past litigation', 14, null, null, 16),
    ('Standard Diligence', 'Legal', 'Insurance policies and claims history', 14, null, null, 17),
    ('Standard Diligence', 'Operations', 'Equipment and vehicle list with condition', 14, null, null, 18),
    ('Standard Diligence', 'Operations', 'Vendor and supplier agreements', 14, null, null, 19),
    ('Standard Diligence', 'Operations', 'Site visit', 21, null, null, 20),
    ('Standard Diligence', 'Financing', 'Submit SBA package to lenders', 7, null, null, 21),
    ('Standard Diligence', 'Financing', 'Business valuation (lender-ordered)', 30, null, null, 22),
    ('Standard Diligence', 'Financing', 'Lender commitment letter', 45, null, null, 23),
    ('Standard Closing', 'Legal', 'APA final and signed', -14, null, null, 1),
    ('Standard Closing', 'Legal', 'Bill of sale and assignment of contracts', -7, null, null, 2),
    ('Standard Closing', 'Legal', 'Lease assignment signed', -10, null, null, 3),
    ('Standard Closing', 'Legal', 'Non-compete and transition agreement', -7, null, null, 4),
    ('Standard Closing', 'Financing', 'SBA loan authorization received', -21, null, null, 5),
    ('Standard Closing', 'Financing', 'Loan closing documents signed', -3, null, null, 6),
    ('Standard Closing', 'Financing', 'Seller note signed (standby terms if SBA)', -3, null, null, 7),
    ('Standard Closing', 'Financing', 'Equity injection deposited', -5, null, null, 8),
    ('Standard Closing', 'Operations', 'Insurance bound, effective at close', -5, null, null, 9),
    ('Standard Closing', 'Operations', 'Licenses and permits transferred or applied for', -10, null, null, 10),
    ('Standard Closing', 'Operations', 'Bank accounts and payroll set up', -7, null, null, 11),
    ('Standard Closing', 'Funds', 'Closing statement reviewed', -2, null, null, 12),
    ('Standard Closing', 'Funds', 'Funds flow confirmed and wired', 0, null, null, 13),
    ('Day 0 Takeover', 'Customers', 'Transfer the CRM and customer and vendor contact lists', 0, 'buyer', 'required', 1),
    ('Day 0 Takeover', 'Customers', 'Notify key customers of the ownership change and introduce yourself', 0, 'buyer', 'required', 2),
    ('Day 0 Takeover', 'Employees', 'Meet each employee and confirm who is staying on', 0, 'buyer', 'required', 3),
    ('Day 0 Takeover', 'Employees', 'Extend and sign new offer or at-will employment letters', 0, 'buyer', 'required', 4),
    ('Day 0 Takeover', 'Employees', 'Set up the payroll system and confirm the first pay run', 0, 'buyer', 'required', 5),
    ('Day 0 Takeover', 'Employees', 'Establish employee benefits and complete enrollment', 0, 'buyer', 'nice_to_have', 6),
    ('Day 0 Takeover', 'Financial', 'Open the operating bank account and move balances over', 0, 'buyer', 'required', 7),
    ('Day 0 Takeover', 'Financial', 'Set up merchant and card processing accounts', 0, 'buyer', 'required', 8),
    ('Day 0 Takeover', 'Financial', 'Finalize the accounts receivable and accounts payable handoff', 0, 'buyer', 'required', 9),
    ('Day 0 Takeover', 'Financial', 'Confirm the opening cash position and reconcile day one', 0, 'buyer', 'required', 10),
    ('Day 0 Takeover', 'Legal & Taxes', 'Apply for the federal employer identification number', 0, 'buyer', 'required', 11),
    ('Day 0 Takeover', 'Legal & Taxes', 'Apply for the required business licenses and permits', 0, 'buyer', 'required', 12),
    ('Day 0 Takeover', 'Legal & Taxes', 'Register for state payroll tax and sales tax accounts', 0, 'buyer', 'required', 13),
    ('Day 0 Takeover', 'Legal & Taxes', 'Transfer or re-title vehicles, equipment, and registrations', 0, 'buyer', 'nice_to_have', 14),
    ('Day 0 Takeover', 'Owner Transition', 'Agree the knowledge transfer and training plan with the seller', 0, 'buyer', 'required', 15),
    ('Day 0 Takeover', 'Owner Transition', 'Collect standard operating procedures and tribal knowledge from the seller', 0, 'seller', 'required', 16),
    ('Day 0 Takeover', 'Owner Transition', 'Confirm the seller transition support schedule', 0, 'buyer', 'nice_to_have', 17),
    ('Day 0 Takeover', 'Operations', 'Transfer utilities, phone, internet, and service accounts', 0, 'buyer', 'required', 18),
    ('Day 0 Takeover', 'Operations', 'Transfer the website, domain, email, and social accounts', 0, 'buyer', 'nice_to_have', 19),
    ('Day 0 Takeover', 'Operations', 'Transfer intellectual property, trademarks, and brand assets', 0, 'buyer', 'required', 20),
    ('Day 0 Takeover', 'Operations', 'Arrange business insurance and confirm coverage is active', 0, 'buyer', 'required', 21),
    ('Day 0 Takeover', 'Operations', 'Collect keys, alarm codes, and system passwords', 0, 'buyer', 'required', 22),
    ('Day 0 Takeover', 'Operations', 'Inspect fixed assets and confirm inventory counts', 0, 'buyer', 'nice_to_have', 23),
    ('First 90 Days', 'Week 1', 'Hold a first all-team meeting and share your early plan', 1, 'buyer', 'required', 1),
    ('First 90 Days', 'Week 1', 'Meet one on one with the key employees', 3, 'buyer', 'required', 2),
    ('First 90 Days', 'Week 1', 'Meet or call the top customers', 5, 'buyer', 'required', 3),
    ('First 90 Days', 'Week 1', 'Meet the key vendors and suppliers', 6, 'buyer', 'nice_to_have', 4),
    ('First 90 Days', 'Week 1', 'Begin reviewing the financial statements and legal documents', 7, 'buyer', 'required', 5),
    ('First 90 Days', 'Weeks 2 to 6', 'Complete a financial deep dive on profit and loss, cash flow, and cost drivers', 14, 'buyer', 'required', 6),
    ('First 90 Days', 'Weeks 2 to 6', 'Define and start tracking the core performance indicators', 18, 'buyer', 'nice_to_have', 7),
    ('First 90 Days', 'Weeks 2 to 6', 'Analyze operations and map the main bottlenecks', 24, 'buyer', 'required', 8),
    ('First 90 Days', 'Weeks 2 to 6', 'Run a customer insight review and gather feedback', 30, 'buyer', 'nice_to_have', 9),
    ('First 90 Days', 'Weeks 2 to 6', 'Review technology and systems and list the gaps', 36, 'buyer', 'nice_to_have', 10),
    ('First 90 Days', 'Weeks 2 to 6', 'Build a retention plan for the key employees', 42, 'buyer', 'required', 11),
    ('First 90 Days', 'Day 45 to Month 2', 'Draft the stabilization roadmap', 45, 'buyer', 'required', 12),
    ('First 90 Days', 'Day 45 to Month 2', 'Analyze profit margins by product and service line', 50, 'buyer', 'nice_to_have', 13),
    ('First 90 Days', 'Day 45 to Month 2', 'Build a rolling cash flow forecast', 55, 'buyer', 'required', 14),
    ('First 90 Days', 'Day 45 to Month 2', 'Document the core standard operating procedures', 60, 'buyer', 'nice_to_have', 15),
    ('First 90 Days', 'Month 3 to Day 90', 'Create an employee development and training plan', 75, 'buyer', 'nice_to_have', 16),
    ('First 90 Days', 'Month 3 to Day 90', 'Optimize sales and marketing and test one growth channel', 82, 'buyer', 'nice_to_have', 17),
    ('First 90 Days', 'Month 3 to Day 90', 'Run the 90 day business review and set the next quarter plan', 90, 'buyer', 'required', 18)
  ) as v(template_name, category, title, due_offset_days, owner_role, importance, sort_order)
    on v.template_name = c.name;

  update public.checklist_template t
  set is_default = true
  where t.account_id = p_account_id
    and (t.name, t.kind) in (('Standard Diligence', 'diligence'), ('Standard Closing', 'closing'), ('Day 0 Takeover', 'post_close'))
    and not exists (
      select 1 from public.checklist_template d
      where d.account_id = p_account_id and d.kind = t.kind and d.is_default
    );
end;
$$;

revoke all on function public.seed_starter_checklist_templates(uuid) from public, anon, authenticated;
grant execute on function public.seed_starter_checklist_templates(uuid) to service_role;

create or replace function public.seed_starter_checklist_templates_for_new_team()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  perform public.seed_starter_checklist_templates(new.id);
  return new;
end;
$$;

create trigger accounts_seed_checklist_templates
  after insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function public.seed_starter_checklist_templates_for_new_team();

-- Sets the due date of a deal's open checklist items from the deal's anchors:
-- diligence items from the LOI signed date, closing items from the closing
-- target, post-close items from the actual close, each plus the item's
-- due_offset_days (negative for closing). Items already received or reviewed
-- keep their date, offer items have no anchor, and a missing anchor clears the
-- date. Runs as the caller and writes through the deal log, so replay agrees.
-- Returns how many items changed.
create or replace function public.recompute_checklist_due_dates(p_deal_id uuid)
  returns int
  language plpgsql
  set search_path = '' as $$
declare
  v_item record;
  v_changed int := 0;
begin
  if not public.has_deal_permission(p_deal_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  for v_item in
    select i.id, ((a.anchor::timestamp + make_interval(days => i.due_offset_days)) at time zone 'UTC') as new_due_at
    from public.checklist_item i
    cross join lateral (
      select case i.kind
        when 'diligence' then (select m.actual_on from public.deal_milestone m where m.deal_id = i.deal_id and m.kind = 'loi_signed')
        when 'closing' then (select m.target_on from public.deal_milestone m where m.deal_id = i.deal_id and m.kind = 'closing')
        when 'post_close' then (select m.actual_on from public.deal_milestone m where m.deal_id = i.deal_id and m.kind = 'closing')
      end as anchor
    ) a
    where i.deal_id = p_deal_id
      and i.removed_at is null
      and i.kind in ('diligence', 'closing', 'post_close')
      and i.due_offset_days is not null
      and i.status in ('not_started', 'requested')
      and i.due_at is distinct from ((a.anchor::timestamp + make_interval(days => i.due_offset_days)) at time zone 'UTC')
  loop
    perform public.append_deal_event(p_deal_id, 'checklist_item', v_item.id, 'checklist_item.due_recomputed',
      jsonb_build_object('due_at', v_item.new_due_at));
    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;

grant execute on function public.recompute_checklist_due_dates(uuid) to authenticated, service_role;

select public.seed_starter_checklist_templates(a.id)
from public.accounts a
where not a.is_personal_account;

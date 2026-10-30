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

-- The two dates an item gets from a deal's anchors: due_at is the anchor plus
-- the item's offset (receive by), review_due_at adds its review days on top
-- (reviewed by). Diligence counts from the LOI signed date, closing from the
-- closing target, post-close from the actual close. No anchor, no dates.
create or replace function public.checklist_anchor_dates(
  p_deal_id uuid,
  p_kind text,
  p_due_offset_days int,
  p_review_offset_days int
) returns table (due_at timestamptz, review_due_at timestamptz)
  language sql stable
  set search_path = '' as $$
  select
    (a.anchor::timestamp + make_interval(days => p_due_offset_days)) at time zone 'UTC',
    (a.anchor::timestamp + make_interval(days => p_due_offset_days + p_review_offset_days)) at time zone 'UTC'
  from (
    select case p_kind
      when 'diligence' then (select m.actual_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'loi_signed')
      when 'closing' then (select m.target_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'closing')
      when 'post_close' then (select m.actual_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'closing')
    end as anchor
  ) a;
$$;

grant execute on function public.checklist_anchor_dates(uuid, text, int, int) to authenticated, service_role;

-- Moves a deal's checklist dates with its anchors. An item's due date moves
-- while it is not started or requested and freezes once received; its review
-- due date keeps moving until the item is reviewed. Offer items have no
-- anchor, and an item whose due date was set by hand keeps both dates. Runs
-- as the caller and writes through the deal log, so replay agrees; whoever has checklists.manage or deals.manage on the deal may call
-- it, and a service role call (the webhook path) is logged as the service.
-- Returns how many items changed.
create or replace function public.recompute_checklist_due_dates(p_deal_id uuid)
  returns int
  language plpgsql
  set search_path = '' as $$
declare
  v_item record;
  v_changed int := 0;
  v_actor public.event_actor_kind := 'user';
begin
  if current_user = 'service_role' then
    v_actor := 'service';
  elsif not (public.has_deal_permission(p_deal_id, 'checklists.manage') or public.has_deal_permission(p_deal_id, 'deals.manage')) then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  for v_item in
    select n.id, n.new_due_at, n.new_review_due_at
    from (
      select i.id, i.due_at, i.review_due_at,
        case when i.status in ('not_started', 'requested') then d.due_at else i.due_at end as new_due_at,
        d.review_due_at as new_review_due_at
      from public.checklist_item i
      cross join lateral public.checklist_anchor_dates(i.deal_id, i.kind, i.due_offset_days, i.review_offset_days) d
      where i.deal_id = p_deal_id
        and i.removed_at is null
        and i.kind in ('diligence', 'closing', 'post_close')
        and i.due_offset_days is not null
        and i.status <> 'reviewed'
        and not i.due_set_manually
    ) n
    where (n.due_at, n.review_due_at) is distinct from (n.new_due_at, n.new_review_due_at)
  loop
    perform public.append_deal_event(p_deal_id, 'checklist_item', v_item.id, 'checklist_item.due_recomputed',
      jsonb_build_object('due_at', v_item.new_due_at, 'review_due_at', v_item.new_review_due_at), null, v_actor);
    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;

grant execute on function public.recompute_checklist_due_dates(uuid) to authenticated, service_role;

-- Which templates have been applied to which deal. The apply path inserts the
-- row before it appends the template's items; a unique violation (23505) means
-- the template was already applied.
create table if not exists public.deal_checklist_application (
  deal_id uuid not null references public.deal (id) on delete cascade,
  template_id uuid not null references public.checklist_template (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users default auth.uid(),
  primary key (deal_id, template_id)
);

create index if not exists ix_deal_checklist_application_account on public.deal_checklist_application (account_id);

alter table public.deal_checklist_application enable row level security;

revoke all on public.deal_checklist_application from anon, authenticated, service_role;
grant select, insert, delete on public.deal_checklist_application to authenticated;
grant select, insert, delete on public.deal_checklist_application to service_role;

create policy deal_checklist_application_read on public.deal_checklist_application
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_checklist_application_insert on public.deal_checklist_application
  for insert to authenticated
  with check (public.has_deal_permission(deal_id, 'checklists.manage'));

create policy deal_checklist_application_delete on public.deal_checklist_application
  for delete to authenticated
  using (
    public.has_deal_permission(deal_id, 'checklists.manage')
    and not exists (
      select 1 from public.checklist_item i
      where i.deal_id = deal_checklist_application.deal_id
        and i.source_template_id = deal_checklist_application.template_id
        and i.removed_at is null
    )
  );

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_checklist_application
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_checklist_application
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.deal_checklist_application
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'template_id', 'checklist_template');

-- Makes a template the only default of its kind for its team.
create or replace function public.set_default_checklist_template(template_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_template public.checklist_template;
begin
  select * into v_template from public.checklist_template t where t.id = set_default_checklist_template.template_id;

  if not found or not public.has_permission((select auth.uid()), v_template.account_id, 'deals.manage') then
    raise exception 'not authorized to change checklist templates' using errcode = 'insufficient_privilege';
  end if;

  if odb.team_locked(v_template.account_id) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  update public.checklist_template t
  set is_default = false
  where t.account_id = v_template.account_id and t.kind is not distinct from v_template.kind
    and t.is_default and t.id <> v_template.id;

  update public.checklist_template t set is_default = true where t.id = v_template.id;
end;
$$;

revoke all on function public.set_default_checklist_template(uuid) from public, anon;
grant execute on function public.set_default_checklist_template(uuid) to authenticated;

-- Claims a template for a deal. Runs as the owner so it sees removed items,
-- which the caller cannot; a caller with no user (the service role) is let in. True when the caller may go on to append the
-- template's items (stamped with source_template_id); false when the template
-- still has live items on the deal, or a claim made and not yet followed by
-- items. A claim whose items have all been removed is replaced. A claim whose
-- append failed is released by deleting the row, which is allowed while the
-- template has no live items on the deal.
create or replace function public.claim_checklist_template_application(p_deal_id uuid, p_template_id uuid)
  returns boolean
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_claimed int;
begin
  if auth.uid() is not null and not public.has_deal_permission(p_deal_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  delete from public.deal_checklist_application a
  where a.deal_id = p_deal_id and a.template_id = p_template_id
    and exists (
      select 1 from public.checklist_item i
      where i.deal_id = p_deal_id and i.source_template_id = p_template_id
    )
    and not exists (
      select 1 from public.checklist_item i
      where i.deal_id = p_deal_id and i.source_template_id = p_template_id and i.removed_at is null
    );

  insert into public.deal_checklist_application (deal_id, template_id, account_id)
  select d.id, p_template_id, d.account_id from public.deal d where d.id = p_deal_id
  on conflict (deal_id, template_id) do nothing;

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

revoke all on function public.claim_checklist_template_application(uuid, uuid) from public, anon;
grant execute on function public.claim_checklist_template_application(uuid, uuid) to authenticated, service_role;

create trigger same_team_source_template_id
  before insert or update on public.checklist_item
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'source_template_id', 'checklist_template');

-- A deal's diligence schedule and its six weeks, made together as the caller.
-- A deal with a schedule already gets that schedule's id back, created false,
-- and nothing new.
create or replace function public.create_diligence_schedule(
  p_deal_id uuid,
  p_start_date date,
  p_template_id uuid default null,
  p_created_by uuid default null
) returns table (schedule_id uuid, created boolean)
  language plpgsql
  set search_path = '' as $$
declare
  v_schedule_id uuid;
begin
  if current_user <> 'service_role' and not public.has_deal_permission(p_deal_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  insert into public.diligence_schedule (account_id, deal_id, start_date, template_id, created_by)
  select d.account_id, d.id, p_start_date, p_template_id, p_created_by
  from public.deal d where d.id = p_deal_id
  on conflict (deal_id) do nothing
  returning id into v_schedule_id;

  if v_schedule_id is null then
    return query select s.id, false from public.diligence_schedule s where s.deal_id = p_deal_id;
    return;
  end if;

  insert into public.schedule_week (schedule_id, account_id, week_no, theme, starts_on)
  select v_schedule_id, s.account_id, w.week_no, w.theme, p_start_date + ((w.week_no - 1) * 7)::int
  from public.diligence_schedule s
  cross join unnest(array[
    'financials/returns', 'client list/revenue', 'staff/HR',
    'systems/leases/licenses/insurance', 'follow-ups', 'open items/APA schedules'
  ]) with ordinality as w(theme, week_no)
  where s.id = v_schedule_id;

  return query select v_schedule_id, true;
end;
$$;

grant execute on function public.create_diligence_schedule(uuid, date, uuid, uuid) to authenticated, service_role;

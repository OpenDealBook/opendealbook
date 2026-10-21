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

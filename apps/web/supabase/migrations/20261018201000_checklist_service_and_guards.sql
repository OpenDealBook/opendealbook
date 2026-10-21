drop index public.ix_diligence_schedule_deal;
create unique index ix_diligence_schedule_deal on public.diligence_schedule (deal_id);

-- Moves a deal's checklist dates with its anchors. An item's due date moves
-- while it is not started or requested and freezes once received; its review
-- due date keeps moving until the item is reviewed. Offer items have no
-- anchor. Runs as the caller and writes through the deal log, so replay
-- agrees; a service role call (the webhook path) is logged as the service.
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
  elsif not public.has_deal_permission(p_deal_id, 'checklists.manage') then
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
grant select, insert on public.deal_checklist_application to authenticated;
grant select, insert on public.deal_checklist_application to service_role;

create policy deal_checklist_application_read on public.deal_checklist_application
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_checklist_application_insert on public.deal_checklist_application
  for insert to authenticated
  with check (public.has_deal_permission(deal_id, 'checklists.manage'));

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_checklist_application
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_checklist_application
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_template_id
  before insert or update on public.deal_checklist_application
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'template_id', 'checklist_template');

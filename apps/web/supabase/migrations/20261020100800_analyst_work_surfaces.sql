create or replace function public.deal_event_permission(p_aggregate_type text, p_event_type text)
  returns text
  language sql immutable set search_path = '' as $$
  select case
    when p_event_type in ('offer.drafted', 'offer.version_added', 'contract.created', 'contract.version_added',
      'contract.version_set', 'contract.comment_posted', 'dr_document.added') then 'deals.work'
    when p_aggregate_type in ('meeting', 'meeting_action_item', 'deal_milestone') then 'deals.work'
    when p_aggregate_type = 'checklist_item' then 'checklists.manage'
    when p_aggregate_type = 'deal_participant' then 'participants.manage'
    else 'deals.manage'
  end;
$$;

create or replace function public.contract_event_changes_status(
  p_contract_id uuid,
  p_event_type text,
  p_payload jsonb
) returns boolean
  language sql stable set search_path = '' as $$
  select case p_event_type
    when 'contract.created' then
      case when c.id is null then coalesce(p_payload ->> 'status', 'draft') <> 'draft'
        else p_payload ->> 'status' is distinct from c.status end
    when 'contract.version_set' then
      p_payload ->> 'status' is not null and p_payload ->> 'status' is distinct from c.status
    else false
  end
  from (select 1) one
  left join public.contract c on c.id = p_contract_id;
$$;

create or replace function public.append_deal_event(
  p_deal_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_aggregate_seq bigint default null,
  p_actor_kind public.event_actor_kind default 'user',
  p_actor_via text default 'web'
) returns table (deal_seq bigint, aggregate_seq bigint)
  language plpgsql security definer set search_path = '' as $$
declare
  v_account_id uuid;
  v_actor_ref uuid;
  v_deal_seq bigint;
  v_agg_seq bigint;
  v_event public.deal_event;
begin
  select d.account_id into v_account_id from public.deal d where d.id = p_deal_id;
  if v_account_id is null then
    v_account_id := (p_payload ->> 'account_id')::uuid;
  end if;
  if v_account_id is null then
    raise exception 'cannot resolve account for deal %', p_deal_id using errcode = 'foreign_key_violation';
  end if;

  if p_actor_kind = 'user' then
    v_actor_ref := (select auth.uid());
    if p_aggregate_type = 'deal_update' then
      raise exception 'only delivery records deal update history' using errcode = 'insufficient_privilege';
    elsif p_aggregate_type = 'lender_room' then
      raise exception 'only the nudge sweep records lender room history' using errcode = 'insufficient_privilege';
    elsif p_event_type = 'deal.created' then
      if not public.has_permission(v_actor_ref, v_account_id, 'deals.create') then
        raise exception 'not authorized to create a deal on account %', v_account_id using errcode = 'insufficient_privilege';
      end if;
    elsif not public.has_deal_permission(p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type))
      and not (p_event_type = 'checklist_item.due_recomputed' and public.has_deal_permission(p_deal_id, 'deals.manage')) then
      raise exception 'not authorized to append % on deal %: needs %',
        p_event_type, p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type)
        using errcode = 'insufficient_privilege';
    elsif public.contract_event_changes_status(p_aggregate_id, p_event_type, p_payload)
      and not public.has_deal_permission(p_deal_id, 'deals.manage') then
      raise exception 'not authorized to change the status of contract %: needs deals.manage', p_aggregate_id
        using errcode = 'insufficient_privilege';
    end if;
  elsif (select auth.role()) <> 'service_role' then
    raise exception 'non-user events require the service role' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_deal_id::text));

  select coalesce(max(de.deal_seq), 0) + 1 into v_deal_seq
  from public.deal_event de where de.deal_id = p_deal_id;

  select coalesce(max(de.aggregate_seq), 0) + 1 into v_agg_seq
  from public.deal_event de
  where de.aggregate_type = p_aggregate_type and de.aggregate_id = p_aggregate_id;

  if p_expected_aggregate_seq is not null and p_expected_aggregate_seq <> v_agg_seq - 1 then
    raise exception 'stale aggregate %/%: expected head %, actual head %',
      p_aggregate_type, p_aggregate_id, p_expected_aggregate_seq, v_agg_seq - 1
      using errcode = 'serialization_failure';
  end if;

  if p_aggregate_type = 'dr_document' then
    perform public.check_dr_document_event(p_deal_id, p_aggregate_id, p_event_type, p_payload, v_actor_ref);
  elsif p_aggregate_type = 'contract' then
    perform public.check_contract_event(p_deal_id, p_aggregate_id, p_event_type, p_payload);
  elsif p_aggregate_type = 'deal' then
    perform public.check_deal_close_deadline_event(p_event_type, p_payload);
  end if;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_ref, actor_via, deal_seq, aggregate_seq
  )
  values (
    v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, p_event_type, p_payload,
    p_actor_kind, v_actor_ref, p_actor_via, v_deal_seq, v_agg_seq
  )
  returning * into v_event;

  perform public.project_deal_event(v_event);

  if v_agg_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, v_agg_seq,
            public.deal_aggregate_state(p_aggregate_type, p_aggregate_id));
  end if;

  if v_deal_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, 'deal-wide', p_deal_id, v_deal_seq,
            public.deal_wide_manifest(p_deal_id));
  end if;

  return query select v_deal_seq, v_agg_seq;
end;
$$;

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

  if tuckin.team_locked(v_template.account_id) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  update public.checklist_template t
  set is_default = false
  where t.account_id = v_template.account_id and t.kind is not distinct from v_template.kind
    and t.is_default and t.id <> v_template.id;

  update public.checklist_template t set is_default = true where t.id = v_template.id;
end;
$$;

create or replace function public.can_work_lender_room(room_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.lender_room r
    where r.id = can_work_lender_room.room_id
      and public.has_deal_permission(r.deal_id, 'deals.work')
  );
$$;

grant execute on function public.can_work_lender_room(uuid) to authenticated, service_role;

create or replace function public.lender_room_shows_document(room_id uuid, document_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select (
      public.is_lender_room_member(lender_room_shows_document.room_id)
      or public.can_work_lender_room(lender_room_shows_document.room_id)
    )
    and public.lender_room_shows_document_unchecked(lender_room_shows_document.room_id, lender_room_shows_document.document_id);
$$;

drop policy checklist_template_insert on public.checklist_template;
create policy checklist_template_insert on public.checklist_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

drop policy checklist_template_update on public.checklist_template;
create policy checklist_template_update on public.checklist_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

drop policy checklist_template_delete on public.checklist_template;
create policy checklist_template_delete on public.checklist_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

drop policy checklist_template_item_insert on public.checklist_template_item;
create policy checklist_template_item_insert on public.checklist_template_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

drop policy checklist_template_item_update on public.checklist_template_item;
create policy checklist_template_item_update on public.checklist_template_item
  for update to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  )
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

drop policy checklist_template_item_delete on public.checklist_template_item;
create policy checklist_template_item_delete on public.checklist_template_item
  for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

drop policy deal_thesis_insert on public.deal_thesis;
create policy deal_thesis_insert on public.deal_thesis
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_thesis_update on public.deal_thesis;
create policy deal_thesis_update on public.deal_thesis
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy calc_version_insert on public.calc_version;
create policy calc_version_insert on public.calc_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy calc_version_update on public.calc_version;
create policy calc_version_update on public.calc_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy calc_version_delete on public.calc_version;
create policy calc_version_delete on public.calc_version
  for delete to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    or (
      public.has_permission((select auth.uid()), account_id, 'deals.work')
      and created_by = (select auth.uid())
      and not is_primary
      and not exists (
        select 1 from public.deal_financials f where f.source_calc_version_id = calc_version.id
      )
    )
  );

drop policy sde_period_insert on public.sde_period;
create policy sde_period_insert on public.sde_period
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy sde_period_update on public.sde_period;
create policy sde_period_update on public.sde_period
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy sde_period_delete on public.sde_period;
create policy sde_period_delete on public.sde_period
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy sde_line_insert on public.sde_line;
create policy sde_line_insert on public.sde_line
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy sde_line_update on public.sde_line;
create policy sde_line_update on public.sde_line
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy sde_line_delete on public.sde_line;
create policy sde_line_delete on public.sde_line
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_calc_input_insert on public.deal_calc_input;
create policy deal_calc_input_insert on public.deal_calc_input
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_calc_input_update on public.deal_calc_input;
create policy deal_calc_input_update on public.deal_calc_input
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_calc_input_delete on public.deal_calc_input;
create policy deal_calc_input_delete on public.deal_calc_input
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy funding_source_insert on public.funding_source;
create policy funding_source_insert on public.funding_source
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy funding_source_update on public.funding_source;
create policy funding_source_update on public.funding_source
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy funding_source_delete on public.funding_source;
create policy funding_source_delete on public.funding_source
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_worksheet_row_insert on public.deal_worksheet_row;
create policy deal_worksheet_row_insert on public.deal_worksheet_row
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_worksheet_row_update on public.deal_worksheet_row;
create policy deal_worksheet_row_update on public.deal_worksheet_row
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy deal_worksheet_row_delete on public.deal_worksheet_row;
create policy deal_worksheet_row_delete on public.deal_worksheet_row
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy upload_batch_insert on public.upload_batch;
create policy upload_batch_insert on public.upload_batch
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy upload_batch_update on public.upload_batch;
create policy upload_batch_update on public.upload_batch
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy upload_item_insert on public.upload_item;
create policy upload_item_insert on public.upload_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.work')
    )
  );

drop policy upload_item_update on public.upload_item;
create policy upload_item_update on public.upload_item
  for update to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.work')
    )
  )
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.work')
    )
  );

drop policy lender_room_read on public.lender_room;
create policy lender_room_read on public.lender_room
  for select to authenticated
  using (public.has_deal_permission(deal_id, 'deals.work'));

drop policy lender_ask_read on public.lender_ask;
create policy lender_ask_read on public.lender_ask
  for select to authenticated
  using (
    public.can_work_lender_room(room_id)
    or public.is_lender_room_member(room_id)
  );

drop policy lender_ask_update on public.lender_ask;
create policy lender_ask_update on public.lender_ask
  for update to authenticated
  using (public.can_work_lender_room(room_id))
  with check (public.can_work_lender_room(room_id));

drop policy lender_ask_message_read on public.lender_ask_message;
create policy lender_ask_message_read on public.lender_ask_message
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_message.ask_id
        and (
          public.can_work_lender_room(a.room_id)
          or public.is_lender_room_member(a.room_id)
        )
    )
  );

drop policy lender_ask_message_insert on public.lender_ask_message;
create policy lender_ask_message_insert on public.lender_ask_message
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and side = 'internal'
    and exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_message.ask_id
        and public.can_work_lender_room(a.room_id)
    )
  );

drop policy lender_ask_file_read on public.lender_ask_file;
create policy lender_ask_file_read on public.lender_ask_file
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_file.ask_id
        and (
          public.can_work_lender_room(a.room_id)
          or public.is_lender_room_member(a.room_id)
        )
    )
  );

drop policy lender_ask_file_insert on public.lender_ask_file;
create policy lender_ask_file_insert on public.lender_ask_file
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_file.ask_id
        and public.can_work_lender_room(a.room_id)
        and public.lender_room_shows_document(a.room_id, lender_ask_file.dr_document_id)
    )
  );

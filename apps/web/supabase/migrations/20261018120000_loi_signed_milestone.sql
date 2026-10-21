-- LOI signed is a fixed milestone after the LOI deadline, and starts shared
-- like APA signing.

alter type public.milestone_kind add value if not exists 'loi_signed' after 'loi_deadline';

create or replace function public.project_deal_milestone(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_milestone.set' then
    -- One day of slack past UTC today, because it is already tomorrow in time
    -- zones ahead of UTC.
    if (ev.payload ->> 'actual_on')::date > current_date + 1 then
      raise exception 'a milestone''s actual date cannot be in the future' using errcode = 'check_violation';
    end if;
    insert into public.deal_milestone (id, account_id, deal_id, kind, label, target_on, actual_on, shared, created_at, updated_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'kind')::public.milestone_kind,
      ev.payload ->> 'label',
      (ev.payload ->> 'target_on')::date,
      (ev.payload ->> 'actual_on')::date,
      coalesce(
        (ev.payload ->> 'shared')::boolean,
        (ev.payload ->> 'kind') in ('loi_signed', 'apa_signing', 'closing', 'effective')
      ),
      ev.created_at, ev.created_at,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      label = excluded.label,
      target_on = excluded.target_on,
      actual_on = excluded.actual_on,
      shared = coalesce((ev.payload ->> 'shared')::boolean, deal_milestone.shared),
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where deal_milestone.deal_id = excluded.deal_id;
  elsif ev.event_type = 'deal_milestone.removed' then
    delete from public.deal_milestone
    where id = ev.aggregate_id and deal_id = ev.deal_id;
  else
    raise exception 'unknown deal_milestone event %', ev.event_type;
  end if;
end;
$$;

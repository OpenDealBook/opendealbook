alter table public.deal_financials add column if not exists adopted_years jsonb;

create or replace function public.project_deal_financials(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.financials_adopted' then
    insert into public.deal_financials (deal_id, account_id, adopted_revenue, adopted_sde, adopted_ebitda, adopted_years, source_calc_version_id, adopted_by, adopted_at)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'adopted_revenue')::numeric,
      (ev.payload ->> 'adopted_sde')::numeric,
      (ev.payload ->> 'adopted_ebitda')::numeric,
      nullif(ev.payload -> 'adopted_years', 'null'::jsonb),
      (ev.payload ->> 'source_calc_version_id')::uuid,
      ev.actor_ref,
      ev.created_at
    )
    on conflict (deal_id) do update set
      adopted_revenue = excluded.adopted_revenue,
      adopted_sde = excluded.adopted_sde,
      adopted_ebitda = excluded.adopted_ebitda,
      adopted_years = excluded.adopted_years,
      source_calc_version_id = excluded.source_calc_version_id,
      adopted_by = excluded.adopted_by,
      adopted_at = excluded.adopted_at;
  else
    raise exception 'unknown deal_financials event %', ev.event_type;
  end if;
end;
$$;

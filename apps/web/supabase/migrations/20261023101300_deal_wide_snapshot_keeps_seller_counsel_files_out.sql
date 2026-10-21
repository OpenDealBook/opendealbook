-- The deal-level snapshot body: the deal row plus a compact manifest of each
-- child aggregate's current head aggregate_seq (D3), not a full child bundle.
-- The team reads these snapshots, so seller and counsel thread messages and
-- Seller's counsel folder files stay out.
-- plpgsql so the body is not checked here: is_seller_counsel_document loads
-- later, in 99v.
create or replace function public.deal_wide_manifest(p_deal_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'deal', (select to_jsonb(d) from public.deal d where d.id = p_deal_id),
    'heads', coalesce((
      select jsonb_object_agg(k, mx)
      from (
        select de.aggregate_type || ':' || de.aggregate_id::text as k, max(de.aggregate_seq) as mx
        from public.deal_event de
        where de.deal_id = p_deal_id
          and de.aggregate_type <> 'seller_counsel_message'
          and not (de.aggregate_type = 'dr_document' and public.is_seller_counsel_document(de.aggregate_id))
        group by de.aggregate_type, de.aggregate_id
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

-- Snapshots already written drop the heads the team must not see.
update public.deal_event_snapshot s
set state = jsonb_set(s.state, '{heads}', coalesce((
  select jsonb_object_agg(h.key, h.value)
  from jsonb_each(s.state -> 'heads') h
  where h.key not like 'seller_counsel_message:%'
    and not (h.key like 'dr_document:%' and public.is_seller_counsel_document(substr(h.key, 13)::uuid))
), '{}'::jsonb))
where s.aggregate_type = 'deal-wide';

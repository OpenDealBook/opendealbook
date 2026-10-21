-- For the deal team, before adding an entry: every entry of the deal, of any
-- status and whichever rooms hide it, sharing a word with the new question,
-- most shared first.
create or replace function public.lender_deal_faq_search(deal_id uuid, query text)
  returns table (id uuid, question text)
  language sql stable security definer
  set search_path = '' as $$
  select e.id, e.question
  from public.lender_faq_entry e
  cross join (select replace(plainto_tsquery('english', lender_deal_faq_search.query)::text, ' & ', ' | ')::tsquery as q) s
  where e.deal_id = lender_deal_faq_search.deal_id
    and public.manages_deal_in_account(e.deal_id, e.account_id)
    and e.search_tsv @@ s.q
  order by ts_rank(e.search_tsv, s.q) desc, e.created_at desc, e.id;
$$;

grant execute on function public.lender_deal_faq_search(uuid, text) to authenticated, service_role;

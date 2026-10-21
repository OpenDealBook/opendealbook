-- A room's FAQ for its open-room members and its deal team, pinned entries
-- first, then newest. With a query, entries sharing any of its words, most
-- shared first.
create or replace function public.lender_room_faq(room_id uuid, query text default null)
  returns table (
    id uuid,
    question text,
    answer text,
    pinned boolean,
    first_published_at timestamptz,
    updated_at timestamptz,
    files jsonb
  )
  language sql stable security definer
  set search_path = '' as $$
  select
    e.id,
    e.question,
    e.answer,
    e.pinned,
    e.first_published_at,
    e.updated_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from public.lender_faq_file f
        where f.entry_id = e.id
      ),
      '[]'::jsonb
    )
  from public.lender_faq_entry e
  cross join (select replace(plainto_tsquery('english', lender_room_faq.query)::text, ' & ', ' | ')::tsquery as q) s
  where (
      public.is_lender_room_member(lender_room_faq.room_id)
      or public.can_manage_lender_room(lender_room_faq.room_id)
    )
    and public.lender_room_shows_faq_entry_unchecked(lender_room_faq.room_id, e.id)
    and (lender_room_faq.query is null or e.search_tsv @@ s.q)
  order by ts_rank(e.search_tsv, s.q) desc nulls last, e.pinned desc, e.first_published_at desc, e.id;
$$;

grant execute on function public.lender_room_faq(uuid, text) to authenticated, service_role;

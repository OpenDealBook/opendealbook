-- ---- Data room and seller Q&A for buyer's counsel ----
-- Counsel are not on the data room read policies, which another file owns;
-- they read through these. The whole data room, less each lender room's own
-- folder, and the seller Q&A read-only.

create or replace function public.buyer_counsel_folders(deal_id uuid)
  returns setof public.dr_folder
  language sql stable security definer
  set search_path = '' as $$
  with recursive lender_room_own as (
    select r.private_folder_id as id
    from public.lender_room r
    where r.deal_id = buyer_counsel_folders.deal_id
    union all
    select f.id from public.dr_folder f join lender_room_own o on f.parent_id = o.id
  )
  select f.*
  from public.dr_folder f
  where f.deal_id = buyer_counsel_folders.deal_id
    and public.is_deal_counsel(buyer_counsel_folders.deal_id, 'buyer')
    and f.id not in (select o.id from lender_room_own o);
$$;

revoke all on function public.buyer_counsel_folders(uuid) from public, anon;
grant execute on function public.buyer_counsel_folders(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_documents(deal_id uuid)
  returns setof public.dr_document
  language sql stable security definer
  set search_path = '' as $$
  select d.*
  from public.dr_document d
  join public.buyer_counsel_folders(buyer_counsel_documents.deal_id) f on f.id = d.folder_id
  where d.removed_at is null;
$$;

revoke all on function public.buyer_counsel_documents(uuid) from public, anon;
grant execute on function public.buyer_counsel_documents(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_seller_questions(deal_id uuid)
  returns table (
    id uuid,
    title text,
    body text,
    status public.seller_room_question_status,
    created_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.title, q.body, q.status, q.created_at
  from public.seller_room_question q
  join public.seller_room r on r.id = q.room_id
  where r.deal_id = buyer_counsel_seller_questions.deal_id
    and public.is_deal_counsel(buyer_counsel_seller_questions.deal_id, 'buyer')
  order by q.created_at desc;
$$;

revoke all on function public.buyer_counsel_seller_questions(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_questions(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_seller_question_messages(deal_id uuid)
  returns table (question_id uuid, side public.seller_side, body text, created_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select m.question_id, m.side, m.body, m.created_at
  from public.seller_room_question_message m
  join public.seller_room_question q on q.id = m.question_id
  join public.seller_room r on r.id = q.room_id
  where r.deal_id = buyer_counsel_seller_question_messages.deal_id
    and public.is_deal_counsel(buyer_counsel_seller_question_messages.deal_id, 'buyer')
  order by m.created_at;
$$;

revoke all on function public.buyer_counsel_seller_question_messages(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_question_messages(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_legacy_seller_questions(deal_id uuid)
  returns table (id uuid, question text, answer text, answered_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.question, q.answer, q.answered_at
  from public.seller_question q
  where q.deal_id = buyer_counsel_legacy_seller_questions.deal_id
    and public.is_deal_counsel(buyer_counsel_legacy_seller_questions.deal_id, 'buyer')
  order by q.created_at nulls last;
$$;

revoke all on function public.buyer_counsel_legacy_seller_questions(uuid) from public, anon;
grant execute on function public.buyer_counsel_legacy_seller_questions(uuid) to authenticated, service_role;


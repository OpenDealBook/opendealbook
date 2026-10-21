-- The lender room header and list name the buyer team and the loan it asks
-- for in place of the deal description, and a timeline answer carries a note
-- and, for no, the earliest date the lender can close.

alter type public.lender_room_summary
  drop attribute deal_description,
  add attribute buyer_team text,
  add attribute loan_amount numeric,
  add attribute loan_type text,
  add attribute term_years numeric,
  add attribute seller_note_amount numeric;

-- Plpgsql so the terms table, made in a later file, binds at call time.
-- Called only from lender_room_view, which owns the check on who may ask.
create or replace function public.lender_room_terms_sought(deal_id uuid)
  returns table (loan_amount numeric, loan_type text, term_years numeric, seller_note_amount numeric)
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select t.loan_amount, t.loan_type, t.term_years, t.seller_note_amount
  from public.deal_terms_sought t
  where t.deal_id = lender_room_terms_sought.deal_id;
end;
$$;

revoke all on function public.lender_room_terms_sought(uuid) from public, anon, authenticated;

create or replace function public.lender_room_view(room_id uuid)
  returns setof public.lender_room_summary
  language sql security definer
  set search_path = '' as $$
  select
    r.id,
    r.deal_id,
    r.name,
    case when a.full_row then r.welcome_note end,
    r.expires_at,
    public.lender_room_is_open(r),
    case when a.full_row then r.private_folder_id end,
    case when a.full_row then p.master_folder_id end,
    b.name,
    b.logo_path,
    coalesce(d.code_name, f.name::text),
    case when a.full_row then public.close_date(d) end,
    case when a.full_row then dl.must_close_by end,
    case when a.full_row then dl.must_close_reason end,
    acc.name::text,
    case when a.full_row then t.loan_amount end,
    case when a.full_row then t.loan_type end,
    case when a.full_row then t.term_years end,
    case when a.full_row then t.seller_note_amount end
  from public.lender_room r
  cross join lateral (
    select
      public.can_manage_lender_room(r.id) as manages,
      public.can_manage_lender_room(r.id) or public.lender_room_is_open(r) as full_row
  ) a
  join public.deal d on d.id = r.deal_id
  join public.accounts acc on acc.id = r.account_id
  left join public.firm f on f.id = d.firm_id
  left join public.lender_package p on p.deal_id = r.deal_id
  left join public.lender_brand b on b.domain = r.brand_domain
  left join lateral public.lender_room_deadline(r.deal_id) dl on true
  left join lateral public.lender_room_terms_sought(r.deal_id) t on true
  where r.id = lender_room_view.room_id
    and (
      (select auth.role()) = 'service_role'
      or a.manages
      or exists (
        select 1 from public.lender_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;

alter table public.lender_room_timeline_answer
  add column note text,
  add column earliest_close_date date,
  add constraint lender_room_timeline_answer_check check (earliest_close_date is null or answer = 'no');

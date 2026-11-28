-- A draft that found nothing in the room says so, and offers to ask the seller.
alter table public.lender_ask_ai_draft add column not_found boolean not null default false;

grant update (not_found) on public.lender_ask_ai_draft to service_role;

-- Only an open or answered ask gets a draft. The ask is locked so it cannot
-- close while a draft starts, but only after the permission check, so an
-- outsider never waits on an ask they cannot see. An ask that moved rooms in
-- between is refused as if it could not be seen.
create or replace function odb.derive_lender_ask_ai_draft_scope()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_kind public.lender_ask_kind;
  v_status public.lender_ask_status;
  v_room_id uuid;
begin
  select a.room_id, a.account_id, r.deal_id
  into new.room_id, new.account_id, new.deal_id
  from public.lender_ask a
  join public.lender_room r on r.id = a.room_id
  where a.id = new.ask_id;
  if not public.can_work_lender_room(new.room_id) then
    raise exception 'only someone who can reply in the room drafts for its asks' using errcode = 'insufficient_privilege';
  end if;
  select a.kind, a.status, a.room_id into v_kind, v_status, v_room_id
  from public.lender_ask a
  where a.id = new.ask_id
  for share of a;
  if v_room_id is distinct from new.room_id then
    raise exception 'only someone who can reply in the room drafts for its asks' using errcode = 'insufficient_privilege';
  end if;
  if v_kind = 'form' then
    raise exception 'a form ask gets no draft' using errcode = 'check_violation';
  end if;
  if v_status not in ('open', 'answered') then
    raise exception 'only an open or answered ask gets a draft' using errcode = 'ODB04';
  end if;
  return new;
end;
$$;

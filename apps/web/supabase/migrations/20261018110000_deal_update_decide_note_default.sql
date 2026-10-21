create or replace function public.decide_deal_update(
  update_id uuid, expected_version int, decision public.deal_update_decision, note text default null,
  recipients jsonb default '[]'
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if not public.has_permission((select auth.uid()), the_update.account_id, 'deal_updates.approve') then
    raise exception 'not allowed to approve deal updates' using errcode = 'insufficient_privilege';
  end if;
  if the_update.author_id = (select auth.uid()) then
    raise exception 'the author cannot decide their own update' using errcode = 'insufficient_privilege';
  end if;
  if the_update.status <> 'pending' then
    raise exception 'only a pending update can be decided';
  end if;
  if the_update.version <> expected_version then
    raise exception 'this update changed since it was opened';
  end if;
  update public.deal_update
  set status = decision::text::public.deal_update_status, decided_by = (select auth.uid()),
    decided_at = now(), decision_note = note
  where id = update_id;
  insert into public.deal_update_recipient (update_id, user_id, contact_id, email, name, entries)
  select decide_deal_update.update_id, r.user_id, r.contact_id, r.email, r.name, r.entries
  from jsonb_populate_recordset(null::public.deal_update_recipient, recipients) r
  where decision = 'approved';
end;
$$;

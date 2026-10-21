drop function if exists public.decide_deal_update(uuid, int, public.deal_update_decision, text, jsonb);

alter table public.deal_update_recipient add constraint deal_update_recipient_update_id_email_key unique (update_id, email);

create or replace function public.decide_deal_update(
  update_id uuid, expected_version int, decision public.deal_update_decision, note text default null
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
end;
$$;

-- The server resolves who an approval reaches and records them here, once:
-- an update that already has recipients keeps them.
create or replace function public.record_deal_update_recipients(update_id uuid, recipients jsonb)
  returns void
  language plpgsql
  set search_path = '' as $$
begin
  if (select u.status from public.deal_update u where u.id = record_deal_update_recipients.update_id) <> 'approved' then
    raise exception 'only an approved update takes recipients';
  end if;
  insert into public.deal_update_recipient (update_id, user_id, contact_id, email, name, entries)
  select record_deal_update_recipients.update_id, r.user_id, r.contact_id, r.email, r.name, r.entries
  from jsonb_populate_recordset(null::public.deal_update_recipient, recipients) r
  where not exists (
    select 1 from public.deal_update_recipient x where x.update_id = record_deal_update_recipients.update_id
  )
  on conflict on constraint deal_update_recipient_update_id_email_key do nothing;
end;
$$;

revoke all on function public.decide_deal_update(uuid, int, public.deal_update_decision, text) from public, anon;
revoke all on function public.record_deal_update_recipients(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_deal_update_recipients(uuid, jsonb) to service_role;
grant execute on function public.decide_deal_update(uuid, int, public.deal_update_decision, text)
  to authenticated, service_role;

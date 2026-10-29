-- One rule for how long seller's counsel keep reading an ended deal, shared
-- by their own read check and by deal deletion, which waits for it to close.
-- delete_deal also takes the typed deal name and returns each recipient's
-- deal name; cleanup that fails after a delete is recorded on the team log.

create or replace function tuckin.seller_counsel_window_end(deal_id uuid)
  returns timestamptz
  language sql stable
  set search_path = '' as $$
  select least(
      d.archived_at,
      case when d.resolution is not null then coalesce(
        (select max(e.created_at) from public.deal_event e
         where e.deal_id = d.id and e.event_type = 'deal.resolved'),
        d.updated_at
      ) end
    ) + interval '1 year'
  from public.deal d
  where d.id = seller_counsel_window_end.deal_id;
$$;

revoke all on function tuckin.seller_counsel_window_end(uuid) from public, anon, authenticated, service_role;

create or replace function public.seller_counsel_read_until(deal_id uuid)
  returns timestamptz
  language sql stable security definer
  set search_path = '' as $$
  select tuckin.seller_counsel_window_end(seller_counsel_read_until.deal_id)
  where exists (
    select 1 from public.deal_counsel c
    where c.deal_id = seller_counsel_read_until.deal_id and c.side = 'seller' and c.user_id = (select auth.uid())
  );
$$;

drop function public.delete_deal(uuid);

create or replace function public.delete_deal(p_deal_id uuid, p_confirm_name text)
  returns jsonb
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal record;
  v_result jsonb;
begin
  select d.id, d.account_id, d.archived_at, f.name, coalesce(d.code_name, f.name) as outside_name,
    a.name as team_name, coalesce(a.timezone, 'UTC') as timezone,
    case when exists (select 1 from public.deal_counsel c where c.deal_id = d.id and c.side = 'seller')
      then tuckin.seller_counsel_window_end(d.id) end as read_until
  into v_deal
  from public.deal d
  join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = d.account_id
  where d.id = p_deal_id
  for update of d;

  if not found then
    raise exception 'This deal no longer exists.' using errcode = 'ODB02';
  end if;

  if not public.is_account_owner(v_deal.account_id) then
    raise exception 'Only the team owner can delete deals.' using errcode = 'ODB02';
  end if;

  if v_deal.archived_at is null then
    raise exception 'Archive the deal before deleting it.' using errcode = 'ODB02';
  end if;

  if p_confirm_name is distinct from v_deal.name then
    raise exception 'The name you typed does not match this deal.' using errcode = 'ODB02';
  end if;

  if v_deal.read_until > now() then
    raise exception 'Seller''s counsel can read this deal until %. You can delete it after that.',
      to_char(v_deal.read_until at time zone v_deal.timezone, 'FMMonth FMDD, YYYY')
      using errcode = 'ODB02';
  end if;

  select jsonb_build_object(
    'account_id', v_deal.account_id,
    'deal_id', p_deal_id,
    'team_name', v_deal.team_name,
    'files', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', file.bucket, 'path', file.path)), '[]'::jsonb)
      from (
        select o.bucket_id as bucket, o.name as path
        from storage.objects o
        where (o.bucket_id in ('data-room', 'meeting-recordings') and starts_with(o.name, 'deal/' || p_deal_id || '/'))
          or (o.bucket_id = 'seller-counsel-thread' and starts_with(o.name, p_deal_id || '/'))
        union
        select v.docx_bucket, v.docx_path
        from public.contract_version v join public.contract c on c.id = v.contract_id
        where c.deal_id = p_deal_id and v.docx_path is not null
        union
        select v.pdf_bucket, v.pdf_path
        from public.contract_version v join public.contract c on c.id = v.contract_id
        where c.deal_id = p_deal_id and v.pdf_path is not null
        union
        select 'generated', path
        from public.generated_document g, unnest(array[g.docx_path, g.pdf_path]) path
        where g.deal_id = p_deal_id and path is not null
      ) file
    ),
    'run_ids', (
      select coalesce(jsonb_agg(r.id), '[]'::jsonb)
      from public.workflow_run r
      where r.account_id = v_deal.account_id
        and r.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
        and (r.trigger_output ->> 'dealId' = p_deal_id::text
          or r.id in (select dr.workflow_run_id from public.diligence_run dr where dr.deal_id = p_deal_id))
    ),
    'recipients', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', p.email, 'deal_name', p.deal_name)), '[]'::jsonb)
      from (
        select m.user_id, m.email, v_deal.outside_name as deal_name
        from public.lender_room_member m join public.lender_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select m.user_id, m.email, v_deal.name
        from public.seller_room_member m join public.seller_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select c.user_id, c.email, v_deal.outside_name
        from public.deal_counsel c
        where c.deal_id = p_deal_id
      ) p
    )
  ) into v_result;

  insert into public.account_event (account_id, event_type, payload)
  values (v_deal.account_id, 'deal.deleted', jsonb_build_object(
    'deal_id', p_deal_id,
    'deal_name', v_deal.name,
    'deleted_by', auth.uid()
  ));

  delete from public.deal where id = p_deal_id;

  return v_result;
end;
$$;

revoke all on function public.delete_deal(uuid, text) from public, anon, service_role;
grant execute on function public.delete_deal(uuid, text) to authenticated;

create or replace function public.record_deal_delete_cleanup_failed(p_account_id uuid, p_deal_id uuid, p_leftovers jsonb)
  returns void
  language sql security definer
  set search_path = '' as $$
  insert into public.account_event (account_id, event_type, payload)
  values (p_account_id, 'deal.delete_cleanup_failed', jsonb_build_object('deal_id', p_deal_id) || p_leftovers);
$$;

revoke all on function public.record_deal_delete_cleanup_failed(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_deal_delete_cleanup_failed(uuid, uuid, jsonb) to service_role;

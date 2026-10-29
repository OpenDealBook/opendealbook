-- Deleting a deal removes it and everything that cascades from it in one
-- transaction. The caller removes the returned files from storage, cancels the
-- returned runs and tells the returned outside parties after commit, since
-- none of those survive the deal's rows to be found again.
create or replace function public.delete_deal(p_deal_id uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal record;
  v_read_until timestamptz;
  v_result jsonb;
begin
  select d.id, d.account_id, d.archived_at, f.name, coalesce(d.code_name, f.name) as outside_name,
    a.name as team_name, coalesce(a.timezone, 'UTC') as timezone
  into strict v_deal
  from public.deal d
  join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = d.account_id
  where d.id = p_deal_id
  for update of d;

  if not public.is_account_owner(v_deal.account_id) then
    raise exception 'Only the team owner can delete deals.' using errcode = 'ODB02';
  end if;

  if v_deal.archived_at is null then
    raise exception 'Archive the deal before deleting it.' using errcode = 'ODB02';
  end if;

  select least(
      d.archived_at,
      case when d.resolution is not null then coalesce(
        (select max(e.created_at) from public.deal_event e
         where e.deal_id = d.id and e.event_type = 'deal.resolved'),
        d.updated_at
      ) end
    ) + interval '1 year'
  into v_read_until
  from public.deal d
  where d.id = p_deal_id
    and exists (select 1 from public.deal_counsel c where c.deal_id = d.id and c.side = 'seller');

  if v_read_until > now() then
    raise exception 'Seller''s counsel can read this deal until %. You can delete it after that.',
      to_char(v_read_until at time zone v_deal.timezone, 'FMMonth FMDD, YYYY')
      using errcode = 'ODB02';
  end if;

  select jsonb_build_object(
    'outside_name', v_deal.outside_name,
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
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', p.email)), '[]'::jsonb)
      from (
        select m.user_id, m.email
        from public.lender_room_member m join public.lender_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select m.user_id, m.email
        from public.seller_room_member m join public.seller_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select c.user_id, c.email
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

revoke all on function public.delete_deal(uuid) from public, anon, service_role;
grant execute on function public.delete_deal(uuid) to authenticated;

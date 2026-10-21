-- Taking a seller number logs contract.version_shown_to_seller_side once, so
-- seller's counsel are told when a version is first shown to them.

create or replace function public.show_contract_version_to_seller_side()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal_id uuid;
  v_role text;
begin
  if new.is_signed and new.shared_at is null then
    new.shared_at := now();
  end if;

  if new.seller_number is null and (new.shared_at is not null or new.party = 'seller') then
    select c.deal_id into v_deal_id from public.contract c where c.id = new.contract_id for update;
    select coalesce(max(v.seller_number), 0) + 1 into new.seller_number
    from public.contract_version v
    where v.contract_id = new.contract_id;

    -- Whoever shows the version, the log entry is the service's; the caller's
    -- role is put back so nothing after this runs as the service.
    v_role := current_setting('request.jwt.claim.role', true);
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform public.append_deal_event(v_deal_id, 'contract', new.contract_id,
      'contract.version_shown_to_seller_side', jsonb_build_object('version_id', new.id),
      null, 'service', 'contract_version');
    perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  end if;

  return new;
end;
$$;

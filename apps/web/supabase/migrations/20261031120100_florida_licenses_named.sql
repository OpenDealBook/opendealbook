create or replace function public.florida_licenses_named(p_name text)
  returns jsonb
  language sql stable
  set search_path = '' as $$
  select jsonb_build_object(
    'snapshot_at', snapshot.created_at,
    'licenses', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'licensee_name', license.licensee_name,
            'license_number', license.license_number,
            'license_type', license.license_type,
            'status', license.status,
            'expires_on', license.expires_on,
            'raw', license.raw
          )
          order by license.id
        )
        from public.florida_license license
        where license.import_id = snapshot.id
          and license.normalized_names @> array[p_name]
      ),
      '[]'::jsonb
    )
  )
  from (
    select id, created_at
    from public.florida_license_import
    where status = 'succeeded'
    order by created_at desc
    limit 1
  ) snapshot;
$$;

revoke all on function public.florida_licenses_named(text) from public, anon, authenticated;
grant execute on function public.florida_licenses_named(text) to service_role;

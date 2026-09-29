-- Append-only audit of every mutating super-admin action. audit_event was
-- retired and deal_event is deal-scoped, so this is the platform-level record of
-- who did what to which account or user. Rows are written only by the
-- service-role client from inside is_super_admin()-gated server actions: there is
-- no insert, update, or delete grant to end users, which keeps the log immutable
-- from the application's reach. actor_user_id is a bare user reference, matching
-- deal_event.actor_ref, so purging a user never erases the audit trail. A
-- verified super admin may read it.

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_action_log enable row level security;

create index ix_admin_action_log_created_at on public.admin_action_log (created_at desc);

revoke all on public.admin_action_log from authenticated, service_role;
grant select on public.admin_action_log to authenticated;
grant insert on public.admin_action_log to service_role;

create policy admin_action_log_read on public.admin_action_log
  for select to authenticated
  using (public.is_super_admin());

-- Role test for an arbitrary principal. has_super_admin_role() can only read the
-- current caller's JWT; this reads the stored app_metadata for any user so the
-- admin actions can refuse to ban or delete a peer super admin.
create or replace function public.is_user_super_admin(target_user_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' = 'super-admin'
       from auth.users u
      where u.id = target_user_id),
    false
  );
$$;

grant execute on function public.is_user_super_admin(uuid) to authenticated, service_role;
